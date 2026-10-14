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

/** Подсказка языка для распознавания. `users.lang` равен `null`, пока пользователь не выбрал
 * язык в /lang, и `"auto"`, если он сознательно выбрал автоопределение. */
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

/**
 * Кладёт файл из Telegram в `dest`.
 *
 * С локальным Bot API сервером файл переносится с общего тома, без него — скачивается по HTTP.
 */
export async function download(api: Api, settings: Settings, fileId: string, dest: string) {
	const file = await api.getFile(fileId)

	await mkdir(dirname(dest), { recursive: true })

	if (settings.apiUrl) {
		// Локальный Bot API сервер отдаёт путь на общем томе, переносом файла не даём
		// разрастаться кешу сервера.
		await move(file.file_path!, dest)

		return
	}

	const resp = await fetch(`https://api.telegram.org/file/bot${settings.botToken}/${file.file_path}`, {
		// Зависшее скачивание держало бы задачу в `pending`, а пользователя занятым до рестарта.
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
	})

	if (!resp.ok || !resp.body) throw new Error(`download returned ${resp.status}`)

	await pipeline(Readable.fromWeb(resp.body as WebStream), createWriteStream(dest))
}

/** Удаляет служебные сообщения бота, уже удалённое сообщение — не ошибка. */
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

/** Пишет прогресс в подпись результата и прячет его кнопки до конца перерендера.
 * Возвращает id сообщения или `null`, если результата уже нет. */
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

/** Команды, приём видео и кнопки под результатом.
 * Зеркалирование в поддержку подключается отдельно в `main.ts`. */
export function handlers({ db, worker, settings, support }: Deps) {
	const router = new Composer<Context>()
	// Группы — это чат поддержки, здесь последний обработчик отвечал бы там на каждое сообщение.
	const dm = router.chatType('private')
	// Пользователи, от которых ждём исправленный текст задачи, по id пользователя.
	const fixing = new Map<number, Fixing>()

	/** Подсказка и распознанный текст больше не нужны,
	 * когда текст пришёл или пользователь занялся другим. */
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

	/** Ставит задачу в очередь и отправляет сообщение с прогрессом, которое потом правит воркер.
	 * Перерендеры сохраняют форму родителя: кружок возвращается кружком. Перерендер
	 * обычного видео пишет прогресс в подпись результата, который заменяет,
	 * так что в чате ничего нового не появляется. */
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
			/** Результат, который заменяем, и задача, которую он показывает. */
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

		// Задача без скачанного видео ещё `pending` и сама себя в очереди не считает,
		// отсюда `|| 1`.
		const queued = texts.QUEUED(db.position(jobId) || 1)
		let progress = replace && !note ? await captionProgress(ctx, replace.msgId, queued) : null

		progress ??= (await quiet(() => ctx.api.sendMessage(ctx.chat!.id, queued))).message_id
		db.setProgressMsg(jobId, progress)
		worker.wake()

		return jobId
	}

	dm.on([':video', ':video_note', ':document'], async (ctx, next) => {
		// Пока ждём исправленный текст, видео не берём: обработчик ниже напомнит про текст.
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
		// Имена нужны только для админки, поэтому обновляем их, когда приходит видео.
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

		// Повторное нажатие начинает заново, первая подсказка только засоряла бы чат.
		await stopFixing(ctx)
		const prompt = await ctx.reply(texts.FIX_PROMPT)
		// Telegram не принимает сообщения длиннее 4096 символов.
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
		// С чатом поддержки всё, что не видео, — сообщение для команды, и оно уже лежит
		// в теме пользователя.
		if (!support.enabled) await ctx.reply(texts.NOT_VIDEO)
		else if (support.ackDue(ctx.from.id)) await ctx.reply(texts.FORWARDED)
	})

	return router
}
