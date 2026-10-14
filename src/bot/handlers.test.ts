import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Message, User } from 'grammy/types'

import { defaults, jobsDir, type Settings } from '#bot/config.ts'
import { markTranscript } from '#bot/core/fixtures.ts'
import { toJson } from '#bot/core/models.ts'
import { Db } from '#bot/db.ts'
import { handlers, langName, sttLang } from '#bot/handlers.ts'
import { Support } from '#bot/support.ts'
import { fakeBot } from '#bot/testing.ts'
import * as texts from '#bot/texts.ts'
import type { Worker } from '#bot/worker.ts'

test('users who never chose get the default language', () => {
	// autodetection took Russian speech for English and translated it
	assert.equal(sttLang(null, 'ru'), 'ru')
})

test('an explicit choice wins over the default', () => assert.equal(sttLang('en', 'ru'), 'en'))
test('auto means no language hint', () => assert.equal(sttLang('auto', 'ru'), null))
test('an empty default means autodetect', () => assert.equal(sttLang(null, null), null))

test('language names', () => {
	assert.equal(langName(null, 'ru'), texts.LANG_NAMES.ru)
	assert.equal(langName('auto', 'ru'), texts.LANG_AUTO)
	assert.equal(langName('en', 'ru'), texts.LANG_NAMES.en)
	assert.equal(langName(null, null), texts.LANG_AUTO)
})

const ALICE: User = { id: 42, is_bot: false, first_name: 'Alice', last_name: 'Smith', username: 'alice' }
const chat = { id: ALICE.id, type: 'private' as const, first_name: 'Alice' }

function setup() {
	const dataDir = mkdtempSync(join(tmpdir(), 'sublya-'))
	// apiUrl: the file comes as a local path, like from the server's Bot API
	const settings: Settings = {
		...defaults,
		botToken: '1:token',
		dataDir,
		apiUrl: 'http://127.0.0.1:8081',
		stt: { url: '', key: 'k', model: '' },
	}
	const fake = fakeBot()
	const db = new Db(':memory:')
	let woken = 0
	const worker = { wake: () => woken++ } as unknown as Worker

	fake.bot.use(handlers({ db, worker, settings, support: new Support(fake.api, db, null) }))
	fake.answer('answerCallbackQuery', () => true)
	fake.answer('editMessageReplyMarkup', () => true)
	const message = (fields: Partial<Message>) =>
		fake.feed({ message: { message_id: 1, date: 0, chat, from: ALICE, ...fields } as Message })
	const press = (data: string) =>
		fake.feed({
			callback_query: {
				id: 'q',
				from: ALICE,
				chat_instance: 'c',
				data,
				message: { message_id: 7, date: 0, chat } as Message,
			},
		})
	const replies = () =>
		fake
			.named('sendMessage')
			.filter((m) => m.chat_id === ALICE.id)
			.map((m) => m.text)

	return { ...fake, settings, db, message, press, replies, woken: () => woken }
}

test('a video is queued, moved from the Bot API volume and handed to the worker', async () => {
	const s = setup()
	const local = join(s.settings.dataDir, 'bot-api', 'video.mp4')

	mkdirSync(join(s.settings.dataDir, 'bot-api'))
	writeFileSync(local, 'video')
	s.answer('getFile', () => ({ file_id: 'V', file_unique_id: 'u', file_path: local }))

	await s.message({
		video: { file_id: 'V', file_unique_id: 'u', width: 720, height: 1280, duration: 12, file_size: 1000 },
		caption: ' стих ',
	})

	const job = s.db.getJob(1)!

	assert.deepEqual([job.status, job.text, job.style, job.lang], ['queued', 'стих', 'classic', 'ru'])
	assert.equal(job.input_path, join(jobsDir(s.settings), '1', 'input.mp4'))
	assert.equal(readFileSync(job.input_path!, 'utf8'), 'video')
	assert.ok(!existsSync(local), "the Bot API server's copy is gone")
	assert.deepEqual(s.replies(), [texts.QUEUED(1)])
	assert.notEqual(job.progress_msg_id, null)
	assert.equal(job.source_msg_id, 1, 'the original is deleted once the result is out')
	assert.equal(s.woken(), 2)
	assert.equal(s.db.getUser(ALICE.id).name, 'Alice Smith')
})

test('a long video is refused before it downloads', async () => {
	const s = setup()

	await s.message({ video: { file_id: 'V', file_unique_id: 'u', width: 1, height: 1, duration: 600 } })
	assert.deepEqual(s.replies(), [texts.TOO_LONG(3)])
	assert.deepEqual(s.named('getFile'), [])
})

test('a document that is not a video is refused', async () => {
	const s = setup()

	await s.message({ document: { file_id: 'D', file_unique_id: 'u', mime_type: 'application/pdf' } })
	assert.deepEqual(s.replies(), [texts.NOT_VIDEO])
})

/** A finished job with its transcript on disk, as the worker leaves it. */
function done(s: ReturnType<typeof setup>) {
	const job = s.db.submit({
		userId: ALICE.id,
		chatId: ALICE.id,
		inputPath: 'in.mp4',
		text: null,
		style: 'classic',
		lang: 'ru',
		parentId: null,
		dailyLimit: 10,
	})

	s.db.finish(job, 'done')
	const work = join(jobsDir(s.settings), String(job))

	mkdirSync(work, { recursive: true })
	writeFileSync(join(work, 'transcript.json'), toJson(markTranscript()))

	return job
}

test('fixing the text re-renders with the new text', async () => {
	const s = setup()
	const job = done(s)

	await s.press(`fix:${job}`)
	assert.equal(s.replies()[0], texts.FIX_PROMPT)
	await s.message({ video: { file_id: 'V', file_unique_id: 'u', width: 1, height: 1, duration: 1 } })
	assert.equal(s.replies().at(-1), texts.FIX_WAITING)
	await s.message({ text: 'новый текст' })
	const rerender = s.db.getJob(job + 1)!

	assert.deepEqual([rerender.parent_id, rerender.text, rerender.status], [job, 'новый текст', 'queued'])
	assert.equal(rerender.source_msg_id, 1, "the user's text goes away with the result")
	assert.equal(rerender.replace_msg_id, 7, 'the new video takes the place of the old one')
	assert.equal(s.named('deleteMessage').length, 3, 'the prompt, the transcript and the reminder')
})

test('the prompt and the transcript go away once the text comes', async () => {
	const s = setup()

	await s.press(`fix:${done(s)}`)
	assert.deepEqual(s.replies().slice(-2)[0], texts.FIX_PROMPT)
	const before = s.replies().length

	await s.message({ text: 'новый текст' })
	assert.equal(s.named('deleteMessage').length, 2)
	assert.equal(s.replies().length, before, 'the queue goes into the caption, nothing new is posted')
})

test('a second press on the fix button replaces the first prompt', async () => {
	const s = setup()
	const job = done(s)

	await s.press(`fix:${job}`)
	await s.press(`fix:${job}`)
	assert.equal(s.named('deleteMessage').length, 2)
})

test('cancel leaves the fix', async () => {
	const s = setup()

	await s.press(`fix:${done(s)}`)
	await s.message({ text: '/cancel', entities: [{ type: 'bot_command', offset: 0, length: 7 }] })
	assert.equal(s.named('deleteMessage').length, 2, 'the prompt is cleaned up')
	await s.message({ text: 'просто текст' })
	assert.deepEqual(s.replies().slice(-2), [texts.CANCELLED, texts.NOT_VIDEO])
})

test('another style re-renders the same video', async () => {
	const s = setup()
	const job = done(s)

	await s.press(`st:${job}:big`)
	const rerender = s.db.getJob(job + 1)!

	assert.deepEqual([rerender.parent_id, rerender.style, rerender.lang], [job, 'big', 'ru'])
	assert.equal(rerender.source_msg_id, null)
	assert.deepEqual([rerender.replace_msg_id, rerender.replace_job_id], [7, job])
	assert.equal(rerender.progress_msg_id, 7, 'the progress lives in the caption of the result')

	assert.deepEqual(
		s.named('editMessageCaption').map((p) => [p.message_id, p.caption]),
		[[7, texts.QUEUED(1)]],
	)

	assert.deepEqual(s.replies(), [], 'nothing new in the chat')
})

test('a gone result gets its progress in a new message', async () => {
	const s = setup()
	const job = done(s)

	s.fail('editMessageCaption', 400, 'Bad Request: message to edit not found')
	await s.press(`st:${job}:big`)
	assert.deepEqual(s.replies(), [texts.QUEUED(1)])
	assert.notEqual(s.db.getJob(job + 1)!.progress_msg_id, 7)
})

test("someone else's video can't be restyled", async () => {
	const s = setup()
	const job = s.db.submit({
		userId: 5,
		chatId: 5,
		inputPath: 'in.mp4',
		text: null,
		style: 'classic',
		lang: null,
		parentId: null,
		dailyLimit: 10,
	})

	await s.press(`st:${job}:big`)

	assert.deepEqual(s.named('answerCallbackQuery').at(-1), {
		callback_query_id: 'q',
		text: texts.NOT_YOURS,
		show_alert: true,
	})

	assert.equal(s.db.getJob(job + 1), null)
})

test('the default style is saved', async () => {
	const s = setup()

	s.answer('editMessageText', () => true)
	await s.press('defstyle:box')
	assert.equal(s.db.getUser(ALICE.id).style, 'box')
	assert.equal(s.named('editMessageText')[0].text, texts.STYLE_SET(texts.STYLE_NAMES.box))
})
