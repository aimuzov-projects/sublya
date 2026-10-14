import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebStream } from 'node:stream/web'
import { Composer, type Api, type Context } from 'grammy'
import type { InlineKeyboardButton, Message } from 'grammy/types'

import { downloadLimit, jobsDir, MB, type Settings } from '#bot/config.ts'
import { move } from '#bot/core/files.ts'
import { fromJson, transcriptText } from '#bot/core/models.ts'
import { Busy, QuotaExceeded, rootId, type Db, type Job } from '#bot/db.ts'
import { isTelegramError, quiet, type Support } from '#bot/support.ts'
import * as texts from '#bot/texts.ts'
import { jobDir, resultKeyboard, type Worker } from '#bot/worker.ts'
import { isStyle, STYLES } from '#shared/subtitles.ts'

const AUTO = 'auto'
const DOWNLOAD_TIMEOUT = 120_000

/** The language hint for recognition. users.lang is null until the user picks one in /lang,
 * and "auto" when they picked autodetection on purpose. */
export function sttLang(chosen: string | null, fallback: string | null): string | null {
	if (chosen === AUTO) return null
	return chosen || fallback
}

export function langName(chosen: string | null, fallback: string | null): string {
	const lang = sttLang(chosen, fallback)
	return lang ? (texts.LANG_NAMES[lang] ?? lang) : texts.LANG_AUTO
}

const rows = (buttons: InlineKeyboardButton[], ...sizes: number[]) => {
	const out: InlineKeyboardButton[][] = []
	let at = 0
	for (const size of sizes) out.push(buttons.slice(at, (at += size)))
	if (at < buttons.length) out.push(buttons.slice(at))
	return { inline_keyboard: out.filter((row) => row.length) }
}

const styleButtons = (data: (style: string) => string) =>
	STYLES.map((s) => ({ text: texts.STYLE_NAMES[s], callback_data: data(s) }))

export async function download(api: Api, settings: Settings, fileId: string, dest: string) {
	const file = await api.getFile(fileId)
	await mkdir(dirname(dest), { recursive: true })
	if (settings.apiUrl) {
		// a local Bot API server hands out a path on the shared volume; moving it keeps the
		// server's cache from growing
		await move(file.file_path!, dest)
		return
	}
	const resp = await fetch(`https://api.telegram.org/file/bot${settings.botToken}/${file.file_path}`, {
		// a stalled download would keep the job pending and the user busy until a restart
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
	})
	if (!resp.ok || !resp.body) throw new Error(`download returned ${resp.status}`)
	await pipeline(Readable.fromWeb(resp.body as WebStream), createWriteStream(dest))
}

/** Deletes the bot's chatter; a message that is already gone is fine. */
async function dropMessages(ctx: Context, ids: number[]) {
	for (const id of ids) {
		try {
			await ctx.api.deleteMessage(ctx.chat!.id, id)
		} catch (e) {
			if (!isTelegramError(e)) throw e
			console.warn(`could not delete message ${id} in chat ${ctx.chat!.id}`, e)
		}
	}
}

/** Puts the progress in the caption of the result and hides its buttons until
 * the re-render is done. Returns the message id, or null if the result is gone. */
async function captionProgress(ctx: Context, msgId: number, caption: string): Promise<number | null> {
	try {
		await ctx.api.editMessageCaption(ctx.chat!.id, msgId, { caption })
		return msgId
	} catch (e) {
		if (!isTelegramError(e)) throw e
		return null
	}
}

const replaceOf = (ctx: Context, job: Job) => {
	const msgId = ctx.callbackQuery?.message?.message_id
	return msgId === undefined ? undefined : { msgId, jobId: job.id }
}

type Fixing = { jobId: number; replace?: { msgId: number; jobId: number }; promptMsgIds: number[] }

export type Deps = { db: Db; worker: Worker; settings: Settings; support: Support }

export function handlers({ db, worker, settings, support }: Deps) {
	const router = new Composer<Context>()
	// groups belong to the support chat; here the fallback would answer every message there
	const dm = router.chatType('private')
	// users waiting to send the corrected text of a job, by user id
	const fixing = new Map<number, Fixing>()

	/** The prompt and the transcript have done their job once the text comes or the user moves on. */
	async function stopFixing(ctx: Context) {
		const fix = fixing.get(ctx.from!.id)
		if (!fix) return
		fixing.delete(ctx.from!.id)
		await dropMessages(ctx, fix.promptMsgIds)
	}

	dm.command('start', async (ctx) => {
		await stopFixing(ctx)
		await ctx.reply(texts.START)
	})

	dm.command('cancel', async (ctx) => {
		await stopFixing(ctx)
		await ctx.reply(texts.CANCELLED)
	})

	dm.command('style', async (ctx) => {
		await stopFixing(ctx)
		const user = db.getUser(ctx.from.id)
		const current = isStyle(user.style) ? texts.STYLE_NAMES[user.style] : user.style
		await ctx.reply(texts.CHOOSE_STYLE(current), {
			reply_markup: rows(
				styleButtons((s) => `defstyle:${s}`),
				2,
				2,
			),
		})
	})

	router.callbackQuery(/^defstyle:(.+)$/, async (ctx) => {
		const style = ctx.match[1]
		if (!isStyle(style)) return ctx.answerCallbackQuery()
		db.setUser(ctx.from.id, { style })
		await ctx.editMessageText(texts.STYLE_SET(texts.STYLE_NAMES[style]))
		await ctx.answerCallbackQuery()
	})

	dm.command('lang', async (ctx) => {
		await stopFixing(ctx)
		const user = db.getUser(ctx.from.id)
		const buttons = [
			{ text: texts.BTN_AUTO, callback_data: `lang:${AUTO}` },
			...Object.entries(texts.LANG_NAMES).map(([code, name]) => ({
				text: `${texts.LANG_FLAGS[code]} ${name}`,
				callback_data: `lang:${code}`,
			})),
		]
		await ctx.reply(texts.CHOOSE_LANG(langName(user.lang, settings.defaultLang)), {
			reply_markup: rows(buttons, 3),
		})
	})

	router.callbackQuery(/^lang:(.+)$/, async (ctx) => {
		const code = ctx.match[1]
		if (code !== AUTO && !(code in texts.LANG_NAMES)) return ctx.answerCallbackQuery()
		db.setUser(ctx.from.id, { lang: code })
		await ctx.editMessageText(texts.LANG_SET(langName(code, settings.defaultLang)))
		await ctx.answerCallbackQuery()
	})

	dm.command('stats', async (ctx) => {
		if (!settings.adminIds.has(ctx.from.id)) return
		await ctx.reply(texts.STATS({ ...db.stats(), stt_limit: settings.sttDailyMinutes }))
	})

	dm.command('admin', async (ctx) => {
		if (!settings.adminIds.has(ctx.from.id) || !settings.adminUrl) return
		const button = { text: texts.BTN_ADMIN, web_app: { url: settings.adminUrl } }
		await ctx.reply(texts.ADMIN_PANEL, { reply_markup: { inline_keyboard: [[button]] } })
	})

	/** Queues a job and posts the progress message the worker will keep editing. Re-renders
	 * keep the parent's shape: a video note comes back as a video note. A re-render of a video
	 * shows its progress in the caption of the result it replaces, so the chat gets nothing new. */
	async function enqueue(
		ctx: Context,
		job: {
			userId: number
			text: string | null
			style: string
			lang: string | null
			parent?: Job
			note?: boolean
			sourceMsgId?: number
			/** The result to replace and the job it shows. */
			replace?: { msgId: number; jobId: number }
		},
	): Promise<number | null> {
		const { parent, replace } = job
		const note = parent ? Boolean(parent.note) : job.note
		let jobId: number
		try {
			jobId = db.submit({
				userId: job.userId,
				chatId: ctx.chat!.id,
				inputPath: parent?.input_path ?? null,
				text: job.text,
				style: job.style,
				lang: job.lang,
				parentId: parent ? rootId(parent) : null,
				dailyLimit: settings.adminIds.has(job.userId) ? null : settings.dailyVideos,
				note,
				sourceMsgId: job.sourceMsgId,
				replaceMsgId: replace?.msgId,
				replaceJobId: replace?.jobId,
			})
		} catch (e) {
			if (e instanceof Busy) await ctx.reply(texts.BUSY)
			else if (e instanceof QuotaExceeded) await ctx.reply(texts.QUOTA(settings.dailyVideos))
			else throw e
			return null
		}
		const queued = texts.QUEUED(db.position(jobId) || 1)
		let progress = replace && !note ? await captionProgress(ctx, replace.msgId, queued) : null
		progress ??= (await quiet(() => ctx.api.sendMessage(ctx.chat!.id, queued))).message_id
		db.setProgressMsg(jobId, progress)
		worker.wake()
		return jobId
	}

	dm.on([':video', ':video_note', ':document'], async (ctx, next) => {
		if (fixing.has(ctx.from.id)) return next()
		const msg: Message = ctx.msg
		const media = msg.video ?? msg.video_note ?? msg.document!
		if (msg.document && !(msg.document.mime_type ?? '').startsWith('video/')) {
			await ctx.reply(texts.NOT_VIDEO)
			return
		}
		if ('duration' in media && media.duration > settings.maxDuration) {
			await ctx.reply(texts.TOO_LONG(Math.floor(settings.maxDuration / 60)))
			return
		}
		const limit = downloadLimit(settings)
		if ((media.file_size ?? 0) > limit) {
			await ctx.reply(texts.TOO_BIG(Math.floor(limit / MB)))
			return
		}

		const user = db.getUser(ctx.from.id)
		// names are only for the admin panel, so they are refreshed when a video comes
		const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ')
		db.setUser(user.id, { name, username: ctx.from.username ?? null })
		const jobId = await enqueue(ctx, {
			userId: user.id,
			text: msg.caption?.trim() || null,
			style: user.style,
			lang: sttLang(user.lang, settings.defaultLang),
			note: Boolean(msg.video_note),
			sourceMsgId: msg.message_id,
		})
		if (jobId === null) return

		const ext = extname(('file_name' in media && media.file_name) || '').toLowerCase() || '.mp4'
		const dest = join(jobsDir(settings), String(jobId), `input${ext}`)
		try {
			await download(ctx.api, settings, media.file_id, dest)
		} catch (e) {
			console.error(`download of job ${jobId} failed`, e)
			db.finish(jobId, 'failed', `download: ${e}`)
			await ctx.reply(texts.DOWNLOAD_FAILED)
			return
		}
		db.ready(jobId, dest)
		worker.wake()
	})

	async function ownedJob(ctx: Context, jobId: number): Promise<Job | null> {
		const job = db.getJob(jobId)
		if (!job || job.user_id !== ctx.from!.id) {
			await ctx.answerCallbackQuery({ text: texts.NOT_YOURS, show_alert: true })
			return null
		}
		if (!existsSync(join(jobDir(settings, job), 'transcript.json'))) {
			await ctx.answerCallbackQuery({ text: texts.EXPIRED, show_alert: true })
			return null
		}
		return job
	}

	router.callbackQuery(/^fix:(\d+)$/, async (ctx) => {
		const job = await ownedJob(ctx, Number(ctx.match[1]))
		if (!job) return
		const transcript = fromJson(await readFile(join(jobDir(settings, job), 'transcript.json'), 'utf8'))
		// a second press starts over, the first prompt would only clutter the chat
		await stopFixing(ctx)
		const prompt = await ctx.reply(texts.FIX_PROMPT)
		const heard = await ctx.reply(transcriptText(transcript).slice(0, 4000))
		const result = ctx.callbackQuery.message?.message_id
		fixing.set(ctx.from.id, {
			jobId: job.id,
			replace: result === undefined ? undefined : { msgId: result, jobId: job.id },
			promptMsgIds: [prompt.message_id, heard.message_id],
		})
		await ctx.answerCallbackQuery()
	})

	dm.on('message', async (ctx, next) => {
		const fix = fixing.get(ctx.from.id)
		if (fix === undefined) return next()
		const text = ctx.msg.text
		if (!text || text.startsWith('/')) {
			const reminder = await ctx.reply(texts.FIX_WAITING)
			fix.promptMsgIds.push(reminder.message_id)
			return
		}
		await stopFixing(ctx)
		const job = db.getJob(fix.jobId)
		if (!job || !existsSync(join(jobDir(settings, job), 'transcript.json'))) {
			await ctx.reply(texts.EXPIRED)
			return
		}
		await enqueue(ctx, {
			userId: job.user_id,
			text,
			style: job.style,
			lang: job.lang,
			parent: job,
			sourceMsgId: ctx.msg.message_id,
			replace: fix.replace,
		})
	})

	router.callbackQuery(/^restyle:(\d+)$/, async (ctx) => {
		const job = await ownedJob(ctx, Number(ctx.match[1]))
		if (!job) return
		const back = { text: texts.BTN_BACK, callback_data: `back:${job.id}` }
		await ctx.editMessageReplyMarkup({
			reply_markup: rows([...styleButtons((s) => `st:${job.id}:${s}`), back], 2, 2, 1),
		})
		await ctx.answerCallbackQuery()
	})

	router.callbackQuery(/^back:(\d+)$/, async (ctx) => {
		await ctx.editMessageReplyMarkup({ reply_markup: resultKeyboard(Number(ctx.match[1])) })
		await ctx.answerCallbackQuery()
	})

	router.callbackQuery(/^st:(\d+):(.+)$/, async (ctx) => {
		const style = ctx.match[2]
		const job = await ownedJob(ctx, Number(ctx.match[1]))
		if (!job || !isStyle(style)) return
		await ctx.editMessageReplyMarkup({ reply_markup: resultKeyboard(job.id) })
		await ctx.answerCallbackQuery()
		await enqueue(ctx, {
			userId: job.user_id,
			text: job.text,
			style,
			lang: job.lang,
			parent: job,
			replace: replaceOf(ctx, job),
		})
	})

	dm.on('message', async (ctx) => {
		// with a support chat anything but a video is a message for the team, and it is already
		// in the user's topic
		if (!support.enabled) await ctx.reply(texts.NOT_VIDEO)
		else if (support.ackDue(ctx.from.id)) await ctx.reply(texts.FORWARDED)
	})

	return router
}
