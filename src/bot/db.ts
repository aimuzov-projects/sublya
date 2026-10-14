// SQLite state: the job queue, per-user settings and daily usage. The schema is the one the
// Python bot created, so the production database opens as it is.

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

import { DEFAULT_STYLE } from '#shared/subtitles.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    parent_id INTEGER REFERENCES jobs(id),
    status TEXT NOT NULL,
    input_path TEXT,
    text TEXT,
    style TEXT NOT NULL,
    lang TEXT,
    progress_msg_id INTEGER,
    error TEXT,
    created_at REAL NOT NULL,
    finished_at REAL
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, id);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    style TEXT NOT NULL,
    lang TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
    day TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    videos INTEGER NOT NULL DEFAULT 0,
    stt_seconds REAL NOT NULL DEFAULT 0,
    bonus INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, user_id)
);
CREATE TABLE IF NOT EXISTS support_topics (
    user_id INTEGER PRIMARY KEY,
    topic_id INTEGER NOT NULL UNIQUE,
    created_at REAL NOT NULL
);
`

// columns added after the first release: CREATE TABLE IF NOT EXISTS won't add them
const MIGRATIONS: Record<string, Record<string, string>> = {
	users: { name: 'TEXT', username: 'TEXT' },
	jobs: { note: 'INTEGER NOT NULL DEFAULT 0' },
	usage: { bonus: 'INTEGER NOT NULL DEFAULT 0' },
}

export class Busy extends Error {}
export class QuotaExceeded extends Error {}

export type Job = {
	id: number
	user_id: number
	chat_id: number
	parent_id: number | null
	status: string
	input_path: string | null
	text: string | null
	style: string
	lang: string | null
	progress_msg_id: number | null
	error: string | null
	created_at: number
	finished_at: number | null
	/** The video came as a video note, so the result goes back as one. */
	note: number
}

/** Re-renders reuse the files of the job that received the video. */
export const rootId = (job: Job) => job.parent_id ?? job.id

export type User = {
	id: number
	style: string
	lang: string | null
	created_at: number
	name: string | null
	username: string | null
}

type Row = Record<string, SQLInputValue>

export type Submit = {
	userId: number
	chatId: number
	inputPath: string | null
	text: string | null
	style: string
	lang: string | null
	parentId: number | null
	/** null (admins) means no quota, though the video is still counted. */
	dailyLimit: number | null
	note?: boolean
}

const DAY = 86400
const isoDay = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10)

export class Db {
	readonly conn: DatabaseSync
	readonly clock: () => number

	constructor(path: string, clock: () => number = () => Date.now() / 1000) {
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
		this.conn = new DatabaseSync(path)
		this.clock = clock
		this.script('PRAGMA journal_mode=WAL')
		this.script(SCHEMA)
		for (const [table, columns] of Object.entries(MIGRATIONS)) {
			const have = new Set(this.all(`PRAGMA table_info(${table})`).map((row) => row.name))
			for (const [column, kind] of Object.entries(columns)) {
				if (!have.has(column)) this.script(`ALTER TABLE ${table} ADD COLUMN ${column} ${kind}`)
			}
		}
	}

	close() {
		this.conn.close()
	}

	today() {
		return isoDay(this.clock())
	}

	/** Runs SQL that may hold several statements and takes no parameters. */
	private script(sql: string) {
		this.conn.exec(sql)
	}

	private one(sql: string, ...args: SQLInputValue[]): Row | undefined {
		const row = this.conn.prepare(sql).get(...args)
		return row && { ...row }
	}

	private all(sql: string, ...args: SQLInputValue[]): Row[] {
		return this.conn
			.prepare(sql)
			.all(...args)
			.map((row) => ({ ...row }))
	}

	private run(sql: string, ...args: SQLInputValue[]) {
		return this.conn.prepare(sql).run(...args)
	}

	getUser(userId: number): User {
		this.run(
			'INSERT OR IGNORE INTO users (id, style, created_at) VALUES (?, ?, ?)',
			userId,
			DEFAULT_STYLE,
			this.clock(),
		)
		return this.one('SELECT * FROM users WHERE id = ?', userId) as User
	}

	setUser(userId: number, fields: Partial<Pick<User, 'style' | 'lang' | 'name' | 'username'>>) {
		this.getUser(userId)
		for (const [name, value] of Object.entries(fields)) {
			if (!['style', 'lang', 'name', 'username'].includes(name)) throw new Error(name)
			this.run(`UPDATE users SET ${name} = ? WHERE id = ?`, value ?? null, userId)
		}
	}

	getJob(jobId: number): Job | null {
		return (this.one('SELECT * FROM jobs WHERE id = ?', jobId) as Job | undefined) ?? null
	}

	private usageToday(userId: number, column: 'videos' | 'bonus'): number {
		const row = this.one(`SELECT ${column} AS n FROM usage WHERE day = ? AND user_id = ?`, this.today(), userId)
		return (row?.n as number) ?? 0
	}

	videosToday(userId: number) {
		return this.usageToday(userId, 'videos')
	}

	bonusToday(userId: number) {
		return this.usageToday(userId, 'bonus')
	}

	/** Adds n videos to the user's quota for today only. Returns today's whole bonus. */
	grantVideos(userId: number, n: number): number {
		this.run(
			'INSERT INTO usage (day, user_id, bonus) VALUES (?, ?, ?) ' +
				'ON CONFLICT (day, user_id) DO UPDATE SET bonus = bonus + excluded.bonus',
			this.today(),
			userId,
			n,
		)
		return this.bonusToday(userId)
	}

	/** Queues a job. Re-renders (with parentId) don't count against the daily quota. Without
	 * inputPath the job stays pending until ready(), so the worker never sees a job whose video
	 * is still downloading. */
	submit(s: Submit): number {
		return this.transaction(() => {
			const active = this.one(
				'SELECT 1 FROM jobs WHERE user_id = ? AND status IN (?, ?, ?)',
				s.userId,
				'pending',
				'queued',
				'running',
			)
			if (active) throw new Busy()
			if (s.parentId === null) {
				const limit = s.dailyLimit === null ? null : s.dailyLimit + this.bonusToday(s.userId)
				if (limit !== null && this.videosToday(s.userId) >= limit) throw new QuotaExceeded()
				this.run(
					'INSERT INTO usage (day, user_id, videos) VALUES (?, ?, 1) ' +
						'ON CONFLICT (day, user_id) DO UPDATE SET videos = videos + 1',
					this.today(),
					s.userId,
				)
			}
			const { lastInsertRowid } = this.run(
				'INSERT INTO jobs (user_id, chat_id, parent_id, status, input_path, text, style,' +
					' lang, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
				s.userId,
				s.chatId,
				s.parentId,
				s.inputPath ? 'queued' : 'pending',
				s.inputPath,
				s.text,
				s.style,
				s.lang,
				s.note ? 1 : 0,
				this.clock(),
			)
			return Number(lastInsertRowid)
		})
	}

	nextJob(): Job | null {
		const id = this.transaction(() => {
			const row = this.one("SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1")
			if (!row) return null
			this.run("UPDATE jobs SET status = 'running' WHERE id = ?", row.id)
			return row.id as number
		})
		return id === null ? null : this.getJob(id)
	}

	position(jobId: number): number {
		return this.one("SELECT COUNT(*) AS n FROM jobs WHERE status = 'queued' AND id <= ?", jobId)!.n as number
	}

	setProgressMsg(jobId: number, msgId: number) {
		this.run('UPDATE jobs SET progress_msg_id = ? WHERE id = ?', msgId, jobId)
	}

	finish(jobId: number, status: string, error: string | null = null) {
		this.run(
			'UPDATE jobs SET status = ?, error = ?, finished_at = ? WHERE id = ?',
			status,
			error,
			this.clock(),
			jobId,
		)
	}

	ready(jobId: number, inputPath: string) {
		this.run(
			"UPDATE jobs SET status = 'queued', input_path = ? WHERE id = ? AND status = 'pending'",
			inputPath,
			jobId,
		)
	}

	/** After a restart: interrupted jobs go back to the queue, unfinished downloads fail. */
	requeueRunning(): number {
		this.run(
			"UPDATE jobs SET status = 'failed', error = 'restarted during download', finished_at = ? WHERE status = 'pending'",
			this.clock(),
		)
		return Number(this.run("UPDATE jobs SET status = 'queued' WHERE status = 'running'").changes)
	}

	addSttSeconds(userId: number, seconds: number) {
		this.run(
			'INSERT INTO usage (day, user_id, stt_seconds) VALUES (?, ?, ?) ' +
				'ON CONFLICT (day, user_id) DO UPDATE SET stt_seconds = stt_seconds + excluded.stt_seconds',
			this.today(),
			userId,
			seconds,
		)
	}

	sttSecondsToday(): number {
		return this.one('SELECT COALESCE(SUM(stt_seconds), 0) AS s FROM usage WHERE day = ?', this.today())!.s as number
	}

	stats() {
		const day = this.today()
		const usage = this.one(
			'SELECT COUNT(*) AS users, COALESCE(SUM(videos), 0) AS videos,' +
				' COALESCE(SUM(stt_seconds), 0) AS stt FROM usage WHERE day = ?',
			day,
		)!
		const jobs = this.one(
			"SELECT SUM(status = 'queued') AS queued, SUM(status = 'failed') AS failed" +
				" FROM jobs WHERE date(created_at, 'unixepoch') = ? OR status = 'queued'",
			day,
		)!
		const total = this.one('SELECT COUNT(*) AS n FROM users')!
		return {
			users_total: total.n as number,
			users_today: usage.users as number,
			videos_today: usage.videos as number,
			stt_minutes_today: minutes(usage.stt),
			queued: (jobs.queued as number) ?? 0,
			failed_today: (jobs.failed as number) ?? 0,
		}
	}

	/** Everything the admin panel shows. A video is a job that received one, re-renders are
	 * counted apart. Days are UTC, like the daily quotas. */
	dashboard(days = 14) {
		const now = this.clock()
		const today = isoDay(now)
		const week = isoDay(now - 6 * DAY)
		const first = isoDay(now - (days - 1) * DAY)
		const dayOf = "date(created_at, 'unixepoch')"

		const users = this.one(
			`SELECT COUNT(*) AS total, COALESCE(SUM(${dayOf} = ?), 0) AS today,` +
				` COALESCE(SUM(${dayOf} >= ?), 0) AS week FROM users`,
			today,
			week,
		)!
		const active = this.one(
			'SELECT COUNT(DISTINCT CASE WHEN day = ? THEN user_id END) AS today,' +
				' COUNT(DISTINCT user_id) AS week FROM usage WHERE videos > 0 AND day >= ?',
			today,
			week,
		)!
		const videos = this.one(
			"SELECT COUNT(*) AS total, COALESCE(SUM(status = 'done'), 0) AS done," +
				" COALESCE(SUM(status = 'failed'), 0) AS failed," +
				` COALESCE(SUM(${dayOf} = ?), 0) AS today, COALESCE(SUM(${dayOf} >= ?), 0) AS week` +
				' FROM jobs WHERE parent_id IS NULL',
			today,
			week,
		)!
		const rerenders = this.one('SELECT COUNT(*) AS n FROM jobs WHERE parent_id IS NOT NULL')!
		const stt = this.one(
			'SELECT COALESCE(SUM(stt_seconds), 0) AS total,' +
				' COALESCE(SUM(CASE WHEN day = ? THEN stt_seconds END), 0) AS today FROM usage',
			today,
		)!
		const queue = this.one(
			"SELECT COALESCE(SUM(status IN ('pending', 'queued')), 0) AS queued," +
				" COALESCE(SUM(status = 'running'), 0) AS running FROM jobs",
		)!

		const byDay = new Map<string, Row>()
		for (let i = days - 1; i >= 0; i--)
			byDay.set(isoDay(now - i * DAY), { videos: 0, done: 0, failed: 0, new_users: 0 })
		const perDay = this.all(
			`SELECT ${dayOf} AS day, COUNT(*) AS videos, SUM(status = 'done') AS done,` +
				` SUM(status = 'failed') AS failed FROM jobs WHERE parent_id IS NULL AND ${dayOf} >= ? GROUP BY day`,
			first,
		)
		for (const { day, ...row } of perDay) Object.assign(byDay.get(day as string) ?? {}, row)
		const joined = this.all(
			`SELECT ${dayOf} AS day, COUNT(*) AS n FROM users WHERE ${dayOf} >= ? GROUP BY day`,
			first,
		)
		for (const row of joined) {
			const entry = byDay.get(row.day as string)
			if (entry) entry.new_users = row.n
		}

		const top = this.all(
			'SELECT u.id AS user_id, u.name, u.username, t.topic_id AS topic, COUNT(j.id) AS videos,' +
				" SUM(j.status = 'done') AS done, MAX(j.created_at) AS last," +
				' COALESCE(d.videos, 0) AS today, COALESCE(d.bonus, 0) AS bonus' +
				' FROM users u JOIN jobs j ON j.user_id = u.id AND j.parent_id IS NULL' +
				' LEFT JOIN support_topics t ON t.user_id = u.id' +
				' LEFT JOIN usage d ON d.user_id = u.id AND d.day = ?' +
				' GROUP BY u.id ORDER BY videos DESC, last DESC LIMIT 10',
			today,
		)
		const recent = this.all(
			'SELECT j.id, j.user_id, u.name, u.username, t.topic_id AS topic, j.status, j.style,' +
				' j.parent_id IS NOT NULL AS rerender, j.created_at, j.finished_at,' +
				' substr(j.error, 1, 300) AS error' +
				' FROM jobs j LEFT JOIN users u ON u.id = j.user_id' +
				' LEFT JOIN support_topics t ON t.user_id = j.user_id ORDER BY j.id DESC LIMIT 20',
		)
		return {
			users: { ...users, active_today: active.today, active_week: active.week } as Row,
			videos: { ...videos, rerenders: rerenders.n } as Row,
			stt_minutes: { total: minutes(stt.total), today: minutes(stt.today) },
			queue,
			days: [...byDay].map(([day, row]): Row => ({ day, ...row })),
			top,
			recent,
		}
	}

	getTopic(userId: number): number | null {
		return (this.one('SELECT topic_id FROM support_topics WHERE user_id = ?', userId)?.topic_id as number) ?? null
	}

	/** null forgets the topic, so the next message opens a new one. */
	setTopic(userId: number, topicId: number | null) {
		if (topicId === null) this.run('DELETE FROM support_topics WHERE user_id = ?', userId)
		else {
			this.run(
				'INSERT OR REPLACE INTO support_topics (user_id, topic_id, created_at) VALUES (?, ?, ?)',
				userId,
				topicId,
				this.clock(),
			)
		}
	}

	userByTopic(topicId: number): number | null {
		return (this.one('SELECT user_id FROM support_topics WHERE topic_id = ?', topicId)?.user_id as number) ?? null
	}

	private transaction<T>(body: () => T): T {
		// BEGIN IMMEDIATE takes the write lock up front, so check-then-insert can't race
		this.script('BEGIN IMMEDIATE')
		try {
			const result = body()
			this.script('COMMIT')
			return result
		} catch (e) {
			this.script('ROLLBACK')
			throw e
		}
	}
}

// Python's round(x, 1) of seconds turned into minutes
const minutes = (seconds: SQLInputValue) => Math.round((seconds as number) / 6) / 10
