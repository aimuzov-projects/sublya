import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import { defaults, jobsDir, type Settings } from '#bot/config.ts'
import { hasFilter, run, tool } from '#bot/core/ffmpeg.ts'
import { markTranscript } from '#bot/core/fixtures.ts'
import { toJson } from '#bot/core/models.ts'
import { Db } from '#bot/db.ts'
import { apiError, fakeBot, networkError } from '#bot/testing.ts'
import * as texts from '#bot/texts.ts'
import { cleanup, Worker } from '#bot/worker.ts'

function setup() {
	const dataDir = mkdtempSync(join(tmpdir(), 'sublya-'))
	const settings: Settings = {
		...defaults,
		botToken: '1:token',
		dataDir,
		adminIds: new Set([99]),
		stt: { url: '', key: 'k', model: '' },
	}
	const db = new Db(join(dataDir, 'sublya.db'))
	const fake = fakeBot()

	fake.answer('deleteMessage', () => true)

	return { ...fake, settings, db, worker: new Worker(fake.api, db, settings) }
}

const queue = (
	db: Db,
	inputPath: string,
	{ parentId = null as number | null, note = false, sourceMsgId = null as number | null } = {},
) => {
	const job = db.submit({
		userId: 1,
		chatId: 1,
		inputPath,
		text: null,
		style: 'classic',
		lang: null,
		parentId,
		dailyLimit: 10,
		note,
		sourceMsgId,
	})

	db.setProgressMsg(job, 500)

	return job
}

test('a missing video has expired', async () => {
	const { db, worker, calls, settings } = setup()
	const job = queue(db, join(jobsDir(settings), '1', 'input.mp4'))

	await worker.process(db.nextJob()!)
	assert.equal(db.getJob(job)!.status, 'failed')

	assert.ok(
		calls.some((c) => c.method === 'sendMessage' && c.payload.chat_id === 1 && c.payload.text === texts.EXPIRED),
	)

	assert.ok(calls.some((c) => c.method === 'deleteMessage' && c.payload.message_id === 500))
	assert.ok(!calls.some((c) => c.payload.chat_id === 99), "users' mistakes don't page admins")
})

test('a failed job keeps the original video', async () => {
	const { db, worker, named, settings } = setup()

	queue(db, join(jobsDir(settings), '1', 'input.mp4'), { sourceMsgId: 300 })
	await worker.process(db.nextJob()!)

	assert.deepEqual(
		named('deleteMessage').map((p) => p.message_id),
		[500],
		'the user may want to send it again',
	)
})

/** A job folder with a silent video and its transcript, so a render needs no STT. */
async function cachedVideo(settings: Settings) {
	const work = join(jobsDir(settings), '1')

	mkdirSync(work, { recursive: true })
	const video = join(work, 'input.mp4')

	await run(
		tool('ffmpeg'),
		'-v',
		'error',
		'-f',
		'lavfi',
		'-i',
		'color=c=gray:s=180x320:d=55:r=2',
		'-f',
		'lavfi',
		'-i',
		'anullsrc=r=16000:cl=mono',
		'-t',
		'55',
		'-shortest',
		'-c:v',
		'libx264',
		'-c:a',
		'aac',
		video,
	)

	writeFileSync(join(work, 'transcript.json'), toJson({ ...markTranscript(), size: [180, 320] }))

	return { work, video }
}

test('a re-render uses the cached transcript', async (t) => {
	if (!(await hasFilter('ass'))) return t.skip('ffmpeg without libass (set SUBLYA_FFMPEG)')

	const { db, worker, calls, settings } = setup()
	const { work, video } = await cachedVideo(settings)

	const root = queue(db, video)

	db.finish(root, 'done')
	const rerender = queue(db, video, { parentId: root })

	await worker.process(db.nextJob()!)

	assert.equal(db.getJob(rerender)!.status, 'done')

	assert.deepEqual(
		calls.map((c) => c.method),
		['editMessageText', 'sendVideo', 'deleteMessage'],
	)

	assert.equal(db.sttSecondsToday(), 0, 'a re-render must not call STT')
	assert.ok(!readdirSync(work).some((f) => f.startsWith('out-')), 'the rendered file is removed after sending')
})

test('a delivered video drops the original, even when it is already gone', async (t) => {
	if (!(await hasFilter('ass'))) return t.skip('ffmpeg without libass (set SUBLYA_FFMPEG)')

	const { db, worker, named, settings, answer } = setup()

	answer('deleteMessage', (p) => {
		if (p.message_id === 300) throw apiError('deleteMessage', 400, 'Bad Request: message to delete not found')

		return true
	})

	const { video } = await cachedVideo(settings)
	const job = queue(db, video, { sourceMsgId: 300 })

	await worker.process(db.nextJob()!)
	assert.equal(db.getJob(job)!.status, 'done')

	assert.deepEqual(
		named('deleteMessage').map((p) => p.message_id),
		[500, 300],
	)
})

function sent(note: boolean) {
	const s = setup()
	const out = join(s.settings.dataDir, 'out.mp4')

	writeFileSync(out, 'x')
	const job = s.db.getJob(queue(s.db, 'in.mp4', { note }))!

	return { ...s, out, job }
}

test('a video note goes back as a video note', async () => {
	const { worker, job, out, named } = sent(true)

	await worker.send(job, out, { ...markTranscript(), size: [384, 384] })
	assert.equal(named('sendVideoNote')[0].length, 384)
	assert.deepEqual(named('sendVideo'), [])
})

test('a refused video note falls back to a video', async () => {
	const { worker, job, out, named, fail } = sent(true)

	fail('sendVideoNote', 400, 'Bad Request: VOICE_MESSAGES_FORBIDDEN')
	await worker.send(job, out, markTranscript())
	assert.equal(named('sendVideo').length, 1)
})

test('cleanup removes only stale job folders', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'sublya-'))
	const [old, fresh] = [join(dir, '1'), join(dir, '2')]

	for (const d of [old, fresh]) {
		mkdirSync(d)
		writeFileSync(join(d, 'input.mp4'), 'x')
	}

	utimesSync(old, 1000, 1000)
	assert.equal(await cleanup(dir, 3600, 1000 + 3601), 1)
	assert.ok(!existsSync(old) && existsSync(fresh))
})

test('a user who blocked the bot fails their job, not the worker', async () => {
	const { db, worker, settings, answer } = setup()

	for (const method of ['editMessageText', 'deleteMessage', 'sendMessage']) {
		answer(method, () => {
			throw apiError(method, 403, 'Forbidden: bot was blocked by the user')
		})
	}

	const job = queue(db, join(jobsDir(settings), '1', 'input.mp4'))

	await worker.process(db.nextJob()!)
	assert.equal(db.getJob(job)!.status, 'failed')
})

test('the progress message keeps changing while a stage runs and stops with it', async () => {
	const { db, worker, named } = setup()

	worker.progressEvery = 5
	const job = db.getJob(queue(db, 'in.mp4'))!

	type Stage = (j: typeof job, lines: readonly string[], work: () => Promise<void>) => Promise<void>
	await (worker as unknown as { stage: Stage }).stage(job, texts.RENDERING, () => delay(60))
	const shown = named('editMessageText').map((p) => p.text)

	assert.ok(shown.length >= 3, `only ${shown.length} edits`)

	assert.ok(
		shown.every((line, i) => texts.RENDERING.includes(line as string) && line !== shown[i - 1]),
		'every edit is a new line of the stage',
	)

	await delay(30)
	assert.equal(named('editMessageText').length, shown.length)
})

test('a lost progress message leaves a delivered video done', async () => {
	const { db, worker, answer } = setup()

	answer('deleteMessage', () => {
		throw networkError('deleteMessage')
	})

	const job = db.getJob(queue(db, 'in.mp4'))!

	db.finish(job.id, 'done')
	// what handle() does after the video went out
	await (worker as unknown as { dropProgress: (j: typeof job) => Promise<void> }).dropProgress(job)
	assert.equal(db.getJob(job.id)!.status, 'done')
})
