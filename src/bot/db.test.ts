import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'

import { Busy, Db, QuotaExceeded } from '#bot/db.ts'

const NOW = 1_790_000_000

function open() {
	const clock = { t: NOW }
	const db = new Db(':memory:', () => clock.t)

	return { db, clock }
}

const submit = (db: Db, user: number, { parentId = null as number | null, limit = 10 as number | null } = {}) =>
	db.submit({
		userId: user,
		chatId: user,
		inputPath: 'in.mp4',
		text: null,
		style: 'classic',
		lang: null,
		parentId,
		dailyLimit: limit,
	})

test('one active job per user', () => {
	const { db } = open()
	const job = submit(db, 1)

	assert.throws(() => submit(db, 1), Busy)
	submit(db, 2) // other users are not affected
	db.finish(job, 'done')
	submit(db, 1)
})

test('a running job blocks too', () => {
	const { db } = open()

	submit(db, 1)
	db.nextJob()
	assert.throws(() => submit(db, 1), Busy)
})

test('the daily quota leaves re-renders out', () => {
	const { db } = open()
	let first: number | null = null

	for (let i = 0; i < 3; i++) {
		const job = submit(db, 1, { limit: 3 })

		first ??= job
		db.finish(job, 'done')
	}

	assert.throws(() => submit(db, 1, { limit: 3 }), QuotaExceeded)
	const rerender = submit(db, 1, { parentId: first, limit: 3 })

	assert.equal(db.getJob(rerender)!.parent_id, first)
	assert.equal(db.videosToday(1), 3)
})

test('the quota resets the next day', () => {
	const { db, clock } = open()

	db.finish(submit(db, 1, { limit: 1 }), 'done')
	assert.throws(() => submit(db, 1, { limit: 1 }), QuotaExceeded)
	clock.t += 86400
	submit(db, 1, { limit: 1 })
})

test('the oldest queued job goes first', () => {
	const { db } = open()
	const [a, b] = [submit(db, 1), submit(db, 2)]
	const job = db.nextJob()!

	assert.equal(job.id, a)
	assert.equal(job.status, 'running')
	assert.equal(db.nextJob()!.id, b)
	assert.equal(db.nextJob(), null)
})

test('running jobs go back to the queue after a restart', () => {
	const { db } = open()
	const a = submit(db, 1)

	db.nextJob()
	assert.equal(db.requeueRunning(), 1)
	assert.equal(db.getJob(a)!.status, 'queued')
	assert.equal(db.nextJob()!.id, a)
})

test('queue position', () => {
	const { db } = open()
	const jobs = [submit(db, 1), submit(db, 2), submit(db, 3)]

	assert.deepEqual(
		jobs.map((j) => db.position(j)),
		[1, 2, 3],
	)

	db.nextJob()

	assert.deepEqual(
		jobs.slice(1).map((j) => db.position(j)),
		[1, 2],
	)
})

test('recognised seconds are counted per day', () => {
	const { db, clock } = open()

	db.addSttSeconds(1, 30)
	db.addSttSeconds(2, 45.5)
	assert.equal(db.sttSecondsToday(), 75.5)
	clock.t += 86400
	assert.equal(db.sttSecondsToday(), 0)
})

test('user settings', () => {
	const { db } = open()
	const user = db.getUser(1)

	assert.deepEqual([user.style, user.lang], ['classic', null])
	db.setUser(1, { style: 'big' })
	db.setUser(1, { lang: 'ru' })
	const changed = db.getUser(1)

	assert.deepEqual([changed.style, changed.lang], ['big', 'ru'])
})

test('finish records the error', () => {
	const { db } = open()
	const job = submit(db, 1)

	db.finish(job, 'failed', 'boom')
	const j = db.getJob(job)!

	assert.deepEqual([j.status, j.error], ['failed', 'boom'])
	assert.notEqual(j.finished_at, null)
})

test('stats', () => {
	const { db } = open()

	db.finish(submit(db, 1), 'failed', 'boom')
	submit(db, 2)
	db.addSttSeconds(2, 90)
	const stats = db.stats()

	assert.equal(stats.videos_today, 2)
	assert.equal(stats.queued, 1)
	assert.equal(stats.failed_today, 1)
	assert.equal(stats.stt_minutes_today, 1.5)
})

const pending = (db: Db, user = 1) =>
	db.submit({
		userId: user,
		chatId: user,
		inputPath: null,
		text: null,
		style: 'classic',
		lang: null,
		parentId: null,
		dailyLimit: 10,
	})

test('a pending job waits for its file', () => {
	const { db } = open()
	const job = pending(db)

	assert.equal(db.nextJob(), null)
	assert.throws(() => submit(db, 1), Busy)
	db.ready(job, 'data/jobs/1/input.mp4')
	const taken = db.nextJob()!

	assert.deepEqual([taken.id, taken.input_path], [job, 'data/jobs/1/input.mp4'])
})

test('a restart fails pending jobs', () => {
	const { db } = open()
	const job = pending(db)

	db.requeueRunning()
	assert.equal(db.getJob(job)!.status, 'failed')
})

test('the video note flag is stored', () => {
	const { db } = open()
	const job = db.submit({
		userId: 1,
		chatId: 1,
		inputPath: 'in.mp4',
		text: null,
		style: 'classic',
		lang: null,
		parentId: null,
		dailyLimit: 10,
		note: true,
	})

	assert.equal(db.getJob(job)!.note, 1)
	db.finish(job, 'done')
	assert.equal(db.getJob(submit(db, 2))!.note, 0)
})

test('old databases get the columns added later', () => {
	const path = join(mkdtempSync(join(tmpdir(), 'sublya-')), 'old.db')
	const old = new DatabaseSync(path)

	old.prepare(
		'CREATE TABLE jobs (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, chat_id INTEGER NOT NULL,' +
			' parent_id INTEGER, status TEXT NOT NULL, input_path TEXT, text TEXT, style TEXT NOT NULL, lang TEXT,' +
			' progress_msg_id INTEGER, error TEXT, created_at REAL NOT NULL, finished_at REAL)',
	).run()

	old.prepare(
		"INSERT INTO jobs (user_id, chat_id, status, style, created_at) VALUES (1, 1, 'done', 'classic', 0)",
	).run()

	old.prepare(
		'CREATE TABLE users (id INTEGER PRIMARY KEY, style TEXT NOT NULL, lang TEXT, created_at REAL NOT NULL)',
	).run()

	old.close()
	const db = new Db(path)

	assert.equal(db.getJob(1)!.note, 0)
	db.setUser(1, { name: 'Alice' })
	assert.equal(db.getUser(1).name, 'Alice')
	db.close()
})

test("a bonus raises today's quota only", () => {
	const { db, clock } = open()

	db.finish(submit(db, 1, { limit: 1 }), 'done')
	assert.equal(db.grantVideos(1, 2), 2)
	assert.equal(db.grantVideos(1, 1), 3)

	for (let i = 0; i < 3; i++) db.finish(submit(db, 1, { limit: 1 }), 'done')

	assert.throws(() => submit(db, 1, { limit: 1 }), QuotaExceeded)
	clock.t += 86400
	assert.equal(db.bonusToday(1), 0)
	db.finish(submit(db, 1, { limit: 1 }), 'done')
	assert.throws(() => submit(db, 1, { limit: 1 }), QuotaExceeded)
})

test('without a limit videos are still counted', () => {
	const { db } = open()

	for (let i = 0; i < 3; i++) db.finish(submit(db, 1, { limit: null }), 'done')

	assert.equal(db.videosToday(1), 3)
})

test('topics are stored both ways', () => {
	const { db } = open()

	db.setTopic(42, 101)
	assert.equal(db.getTopic(42), 101)
	assert.equal(db.userByTopic(101), 42)
	db.setTopic(42, null)
	assert.equal(db.getTopic(42), null)
	assert.equal(db.userByTopic(101), null)
})

test('the dashboard counts videos apart from re-renders', () => {
	const { db } = open()

	db.setUser(1, { name: 'Alice', username: 'alice' })
	const first = submit(db, 1)

	db.finish(first, 'done')
	const rerender = submit(db, 1, { parentId: first })

	db.finish(rerender, 'done')
	db.getUser(2)
	const failed = submit(db, 2)

	db.finish(failed, 'failed', 'boom')
	db.addSttSeconds(1, 90)

	const d = db.dashboard(3)

	assert.equal(d.users.total, 2)
	assert.equal(d.users.today, 2)
	assert.equal(d.users.active_today, 2)
	assert.deepEqual(d.videos, { total: 2, done: 1, failed: 1, today: 2, week: 2, rerenders: 1 })
	assert.deepEqual(d.stt_minutes, { total: 1.5, today: 1.5 })

	assert.deepEqual(
		d.days.map((day) => day.videos),
		[0, 0, 2],
	)

	assert.equal(d.days.at(-1)!.new_users, 2)
	assert.equal(d.top[0].name, 'Alice')
	assert.equal(d.top[0].user_id, 1)
	assert.equal(d.top[0].videos, 1)

	assert.deepEqual(
		d.recent.map((j) => j.id),
		[failed, rerender, first],
	)

	assert.equal(d.recent[0].error, 'boom')
})
