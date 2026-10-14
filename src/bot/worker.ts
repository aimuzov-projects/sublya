// One background worker, one job at a time: parallel ffmpeg only slows everyone.

import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { InputFile, InputMediaBuilder, type Api } from 'grammy'
import type { InlineKeyboardMarkup } from 'grammy/types'

import { jobsDir, type Settings } from '#bot/config.ts'
import { align } from '#bot/core/align.ts'
import { duration } from '#bot/core/audio.ts'
import { FFmpegError } from '#bot/core/ffmpeg.ts'
import { fromJson, toJson, type Transcript } from '#bot/core/models.ts'
import { render } from '#bot/core/render.ts'
import { NoSpeech, SttError, transcribe } from '#bot/core/transcribe.ts'
import { rootId, type Db, type Job } from '#bot/db.ts'
import { isBadRequest, quiet } from '#bot/support.ts'
import * as texts from '#bot/texts.ts'
import { isStyle } from '#shared/subtitles.ts'

const IDLE_POLL = 5000
const CLEANUP_EVERY = 3600 * 1000

/** A failure the user can understand; the message goes to them as is. */
export class UserError extends Error {}

export const resultKeyboard = (jobId: number): InlineKeyboardMarkup => ({
	inline_keyboard: [
		[
			{ text: texts.BTN_FIX, callback_data: `fix:${jobId}` },
			{ text: texts.BTN_STYLE, callback_data: `restyle:${jobId}` },
		],
	],
})

export const jobDir = (settings: Settings, job: Job) => join(jobsDir(settings), String(rootId(job)))

export type WorkerApi = Pick<
	Api,
	| 'sendVideo'
	| 'sendVideoNote'
	| 'sendMessage'
	| 'editMessageText'
	| 'editMessageCaption'
	| 'editMessageMedia'
	| 'deleteMessage'
>

export class Worker {
	readonly api: WorkerApi
	readonly db: Db
	readonly settings: Settings
	/** How often the progress message changes its line; Telegram is fine with an edit this rare. */
	progressEvery = 4000
	private wakeUp: (() => void) | null = null

	constructor(api: WorkerApi, db: Db, settings: Settings) {
		this.api = api
		this.db = db
		this.settings = settings
	}

	/** A new job is queued: stop waiting for the next poll. */
	wake() {
		this.wakeUp?.()
	}

	async run(signal?: AbortSignal): Promise<void> {
		const requeued = this.db.requeueRunning()

		if (requeued) console.info(`requeued ${requeued} interrupted jobs`)

		while (!signal?.aborted) {
			const job = this.db.nextJob()

			if (job) {
				await this.process(job)
				continue
			}

			const woken = new Promise<void>((resolve) => (this.wakeUp = resolve))

			await Promise.race([woken, delay(IDLE_POLL, undefined, { signal }).catch(() => {})])
			this.wakeUp = null
		}
	}

	async process(job: Job): Promise<void> {
		try {
			await this.handle(job)
		} catch (e) {
			if (e instanceof UserError) await this.fail(job, e.message, e.message)
			else if (e instanceof NoSpeech) await this.fail(job, texts.NO_SPEECH, e.message)
			else if (e instanceof SttError) await this.fail(job, texts.STT_FAILED, e.message, true)
			else if (e instanceof FFmpegError)
				await this.fail(job, texts.RENDER_FAILED, `${e.message}\n${e.stderr}`, true)
			else {
				console.error(`job ${job.id} failed`, e)
				await this.fail(job, texts.FAILED, String(e instanceof Error ? (e.stack ?? e) : e), true)
			}
		}
	}

	private async handle(job: Job): Promise<void> {
		const work = jobDir(this.settings, job)
		const video = job.input_path

		if (!video || !existsSync(video)) throw new UserError(texts.EXPIRED)

		const cached = join(work, 'transcript.json')

		let transcript: Transcript

		if (existsSync(cached)) {
			transcript = fromJson(await readFile(cached, 'utf8'))
		} else {
			const { maxDuration, sttDailyMinutes } = this.settings

			// documents come without a duration, so the limit is checked again here
			if ((await duration(video)) > maxDuration) throw new UserError(texts.TOO_LONG(Math.floor(maxDuration / 60)))

			if (this.db.sttSecondsToday() >= sttDailyMinutes * 60) throw new UserError(texts.STT_LIMIT)

			transcript = await this.stage(job, texts.RECOGNIZING, () =>
				transcribe(video, work, this.settings.stt, job.lang),
			)

			await writeFile(cached, toJson(transcript), 'utf8')
			this.db.addSttSeconds(job.user_id, transcript.duration)
		}

		const words = align(transcript, job.text, this.settings.sttLag)
		const style = isStyle(job.style) ? job.style : 'classic'
		const out = await this.stage(job, texts.RENDERING, () =>
			render(video, words, transcript.size, work, style, Boolean(job.note)),
		)

		let inPlace: boolean

		try {
			inPlace = await this.send(job, out, transcript)
		} finally {
			await unlink(out).catch(() => {})
		}

		this.db.finish(job.id, 'done')
		await this.dropProgress(job, true)
		// the result carries the buttons and the job folder keeps the input, so the original is
		// clutter; on a failure it stays for the user to send again
		await this.drop(job, job.source_msg_id, 'source')

		// a video note can't be swapped in place, so the old one goes once the new one is out
		if (!inPlace) await this.drop(job, job.replace_msg_id, 'old result')
	}

	/** Sends the result; true if it took the place of the old one in the same message. */
	async send(job: Job, out: string, transcript: Transcript): Promise<boolean> {
		const [w, h] = transcript.size
		const seconds = Math.round(transcript.duration)
		const markup = { reply_markup: resultKeyboard(job.id) }

		if (job.note) {
			try {
				await this.api.sendVideoNote(job.chat_id, new InputFile(out, 'sublya.mp4'), {
					length: w,
					duration: seconds,
					...markup,
				})

				return false
			} catch (e) {
				if (!isBadRequest(e)) throw e

				// users who closed voice messages in privacy settings can't get video notes
				console.warn(`video note for job ${job.id} refused, sending a video`)
			}
		}

		const video = { width: w, height: h, duration: seconds, supports_streaming: true }

		// a re-render takes the place of the video it came from, so the chat keeps one result
		if (job.replace_msg_id !== null) {
			try {
				const media = InputMediaBuilder.video(new InputFile(out, 'sublya.mp4'), video)

				await this.api.editMessageMedia(job.chat_id, job.replace_msg_id, media, markup)

				return true
			} catch (e) {
				if (!isBadRequest(e)) throw e

				// the user deleted that message
				console.warn(`could not replace the result of job ${job.id}, sending a new one`)
			}
		}

		await this.api.sendVideo(job.chat_id, new InputFile(out, 'sublya.mp4'), { ...video, ...markup })

		return false
	}

	private async fail(job: Job, userText: string, error: string, notifyAdmins = false) {
		this.db.finish(job.id, 'failed', error)
		await this.dropProgress(job, false)

		try {
			await this.api.sendMessage(job.chat_id, userText)
		} catch (e) {
			// the user may have blocked the bot; the queue goes on either way
			console.error(`could not tell user ${job.user_id} about job ${job.id}`, e)
		}

		if (notifyAdmins) await this.notifyAdmins(texts.ADMIN_ERROR(job.id, job.user_id, error))
	}

	async notifyAdmins(text: string) {
		for (const admin of this.settings.adminIds) {
			try {
				await quiet(() => this.api.sendMessage(admin, text.slice(-4000)))
			} catch (e) {
				console.error(`could not notify admin ${admin}`, e)
			}
		}
	}

	// the handler records the message right after queueing, so it may land after we start
	private progressMsg = (job: Job) => this.db.getJob(job.id)?.progress_msg_id ?? null

	// a re-render keeps its progress in the caption of the result it replaces
	private inCaption = (job: Job, msgId: number) => msgId === job.replace_msg_id

	/** Runs a stage while the progress message cycles through its lines, so a long render
	 * doesn't look frozen. The last edit lands before the stage returns, never after the result. */
	private async stage<T>(job: Job, lines: readonly string[], work: () => Promise<T>): Promise<T> {
		const done = new AbortController()
		const ticker = (async () => {
			let i = Math.floor(Math.random() * lines.length)

			while (!done.signal.aborted) {
				await this.progress(job, lines[i])
				i = (i + 1) % lines.length
				await delay(this.progressEvery, undefined, { signal: done.signal }).catch(() => {})
			}
		})()

		try {
			return await work()
		} finally {
			done.abort()
			await ticker
		}
	}

	private async progress(job: Job, text: string) {
		const msgId = this.progressMsg(job)

		if (msgId === null) return

		try {
			if (this.inCaption(job, msgId)) await this.api.editMessageCaption(job.chat_id, msgId, { caption: text })
			else await this.api.editMessageText(job.chat_id, msgId, text)
		} catch (e) {
			// the progress message is a courtesy: the same text again, a deleted message, a blocked
			// bot or a network hiccup must not cost the user their video
			if (!isBadRequest(e)) console.warn(`could not update the progress of job ${job.id}`, e)
		}
	}

	/** A caption goes away with the new video; without one the old result
	 * gets its caption and buttons back. */
	private async dropProgress(job: Job, delivered: boolean) {
		const msgId = this.progressMsg(job)

		if (msgId === null || !this.inCaption(job, msgId)) return this.drop(job, msgId, 'progress')

		if (delivered || job.replace_job_id === null) return

		try {
			await this.api.editMessageCaption(job.chat_id, msgId, {
				caption: '',
				reply_markup: resultKeyboard(job.replace_job_id),
			})
		} catch (e) {
			if (!isBadRequest(e)) console.warn(`could not restore the result of job ${job.id}`, e)
		}
	}

	private async drop(job: Job, msgId: number | null, what: string) {
		if (msgId === null) return

		try {
			await this.api.deleteMessage(job.chat_id, msgId)
		} catch (e) {
			if (!isBadRequest(e)) console.warn(`could not drop the ${what} of job ${job.id}`, e)
		}
	}
}

/** Removes job folders idle for ttl seconds. Re-renders touch them, so they live on. */
export async function cleanup(dir: string, ttl: number, now = Date.now() / 1000): Promise<number> {
	let removed = 0

	for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
		if (!entry.isDirectory()) continue

		const path = join(dir, entry.name)

		if (now - (await stat(path)).mtimeMs / 1000 > ttl) {
			await rm(path, { recursive: true, force: true })
			removed++
		}
	}

	return removed
}

export async function cleanupLoop(settings: Settings, signal?: AbortSignal) {
	while (!signal?.aborted) {
		const removed = await cleanup(jobsDir(settings), settings.jobTtl)

		if (removed) console.info(`removed ${removed} old job folders`)

		await delay(CLEANUP_EVERY, undefined, { signal }).catch(() => {})
	}
}
