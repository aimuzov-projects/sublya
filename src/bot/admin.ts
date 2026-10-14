// Admin Mini App: one page and a small JSON API, served from the bot process.
//
// Telegram signs the Mini App's initData with the bot token, so the signature is the whole
// authentication: no sessions, cookies or separate secrets.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { Api } from 'grammy'

import type { Settings } from '#bot/config.ts'
import type { Db } from '#bot/db.ts'
import { isTelegramError } from '#bot/support.ts'
import * as texts from '#bot/texts.ts'

const PAGE = new URL('admin.html', import.meta.url)
// how long a signed initData stays valid: the panel is reopened, not kept open for days
const MAX_AGE = 24 * 3600
const MAX_INIT_DATA = 8192
const BALANCE_TTL = 60
const AVATAR_TTL = 24 * 3600
const AVATAR_SIZE = 160

/** The Telegram user id behind a signed initData, or null if the signature doesn't hold or
 * is too old. */
export function verifyInitData(initData: string, botToken: string, now = Date.now() / 1000): number | null {
	if (!initData || initData.length > MAX_INIT_DATA) return null
	const fields = new Map(new URLSearchParams(initData))
	const given = fields.get('hash') ?? ''
	fields.delete('hash')
	// every field but hash takes part, the Ed25519 signature included
	const check = [...fields]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([k, v]) => `${k}=${v}`)
		.join('\n')
	const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
	const expected = createHmac('sha256', secret).update(check).digest('hex')
	const [a, b] = [Buffer.from(given), Buffer.from(expected)]
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null
	try {
		if (now - Number.parseInt(fields.get('auth_date')!, 10) > MAX_AGE) return null
		const userId = JSON.parse(fields.get('user')!).id
		return Number.isInteger(userId) ? userId : null
	} catch {
		return null
	}
}

export type Balance = Record<string, number | null>

/** Balance and spending of the STT key. Cached: the panel may be refreshed often, and
 * OpenRouter's own numbers lag behind anyway. */
export class OpenRouter {
	readonly baseUrl: string
	readonly key: string
	private cached: { at: number; value: Balance | null } | null = null

	constructor(baseUrl: string, key: string) {
		this.baseUrl = baseUrl.replace(/\/+$/, '')
		this.key = key
	}

	private async get(path: string) {
		const resp = await fetch(`${this.baseUrl}/${path}`, {
			headers: { Authorization: `Bearer ${this.key}` },
			signal: AbortSignal.timeout(10_000),
		})
		if (!resp.ok) throw new Error(`OpenRouter returned ${resp.status}`)
		return (await resp.json()).data
	}

	async fetch(): Promise<Balance> {
		const credits = await this.get('credits')
		const key = await this.get('key')
		return {
			balance: Math.round((credits.total_credits - credits.total_usage) * 1e4) / 1e4,
			credits: credits.total_credits,
			usage: credits.total_usage,
			usage_daily: key.usage_daily ?? null,
			usage_weekly: key.usage_weekly ?? null,
			usage_monthly: key.usage_monthly ?? null,
		}
	}

	/** null when OpenRouter doesn't answer or the STT endpoint isn't OpenRouter at all. */
	async balance(): Promise<Balance | null> {
		const now = performance.now() / 1000
		if (this.cached && now - this.cached.at < BALANCE_TTL) return this.cached.value
		let value: Balance | null = null
		try {
			value = await this.fetch()
		} catch (e) {
			console.warn('could not get the OpenRouter balance', e)
		}
		this.cached = { at: now, value }
		return value
	}
}

export type ProfilesApi = Pick<Api, 'getChat' | 'getUserProfilePhotos' | 'getFile' | 'sendMessage'>
type Named = { user_id: unknown; name: unknown; username: unknown }

/** Names and avatars of the users the panel lists. Users who wrote before the bot kept names
 * get theirs from getChat once; avatars live on disk for AVATAR_TTL. */
export class Profiles {
	readonly api: ProfilesApi
	readonly db: Db
	readonly settings: Settings
	readonly dir: string
	// getChat fails for someone who blocked the bot; asking again every refresh is useless
	private readonly noName = new Set<number>()

	constructor(api: ProfilesApi, db: Db, settings: Settings) {
		this.api = api
		this.db = db
		this.settings = settings
		this.dir = join(settings.dataDir, 'avatars')
	}

	async fillNames(rows: Named[]) {
		const missing = new Set(rows.filter((r) => !r.name).map((r) => r.user_id as number))
		const found = new Map<number, [string | null, string | null]>()
		for (const userId of missing) {
			if (this.noName.has(userId)) continue
			let chat
			try {
				chat = await this.api.getChat(userId)
			} catch (e) {
				if (!isTelegramError(e)) throw e
				this.noName.add(userId)
				continue
			}
			const first = 'first_name' in chat ? chat.first_name : undefined
			const last = 'last_name' in chat ? chat.last_name : undefined
			const name = [first, last].filter(Boolean).join(' ') || null
			const username = ('username' in chat ? chat.username : null) ?? null
			this.db.setUser(userId, { name, username })
			found.set(userId, [name, username])
		}
		for (const r of rows) {
			const known = found.get(r.user_id as number)
			if (known) [r.name, r.username] = known
		}
	}

	async avatar(userId: number): Promise<string | null> {
		const path = join(this.dir, `${userId}.jpg`)
		const none = join(this.dir, `${userId}.none`)
		for (const cached of [path, none]) {
			if (existsSync(cached) && Date.now() / 1000 - (await stat(cached)).mtimeMs / 1000 < AVATAR_TTL) {
				return cached === path ? path : null
			}
		}
		await mkdir(this.dir, { recursive: true })
		try {
			const photos = await this.api.getUserProfilePhotos(userId, { limit: 1 })
			if (!photos.photos.length) {
				// no photo, or it is hidden from the bot by privacy settings
				await writeFile(none, '')
				await unlink(path).catch(() => {})
				return null
			}
			const sizes = photos.photos[0]
			const size = sizes.find((s) => s.width >= AVATAR_SIZE) ?? sizes.at(-1)!
			const file = await this.api.getFile(size.file_id)
			if (this.settings.apiUrl) {
				// a local Bot API server hands out a path on the shared volume; copied, not moved,
				// as it keeps profile photos for itself too
				await copyFile(file.file_path!, path)
			} else {
				const resp = await fetch(`https://api.telegram.org/file/bot${this.settings.botToken}/${file.file_path}`)
				if (!resp.ok) throw new Error(`avatar download returned ${resp.status}`)
				await writeFile(path, Buffer.from(await resp.arrayBuffer()))
			}
		} catch (e) {
			console.warn(`no avatar for user ${userId}`, e)
			return null
		}
		await unlink(none).catch(() => {})
		return path
	}
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers })
	res.end(JSON.stringify(body))
}

export function makeHandler(db: Db, settings: Settings, openrouter: OpenRouter, profiles: Profiles) {
	/** null if the request comes from an admin, otherwise the status to refuse with. */
	const refusal = (req: IncomingMessage) => {
		const header = req.headers.authorization ?? ''
		const userId = verifyInitData(header.startsWith('tma ') ? header.slice(4) : '', settings.botToken)
		if (userId === null) return [401, 'unauthorized'] as const
		if (!settings.adminIds.has(userId)) return [403, 'forbidden'] as const
		return null
	}

	return async (req: IncomingMessage, res: ServerResponse) => {
		const path = new URL(req.url ?? '/', 'http://admin').pathname
		const route = (method: string, pattern: RegExp) => (req.method === method ? path.match(pattern) : null)
		try {
			if (route('GET', /^\/admin\/?$/)) {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
				res.end(await readFile(PAGE))
				return
			}
			const stats = route('GET', /^\/admin\/api\/stats$/)
			const avatar = route('GET', /^\/admin\/api\/avatar\/([^/]+)$/)
			const bonus = route('POST', /^\/admin\/api\/users\/([^/]+)\/bonus$/)
			if (!stats && !avatar && !bonus) return json(res, 404, { error: 'not found' })
			const refused = refusal(req)
			if (refused) return json(res, refused[0], { error: refused[1] })

			if (stats) {
				const data = db.dashboard()
				await profiles.fillNames([...data.top, ...data.recent] as Named[])
				return json(
					res,
					200,
					{
						...data,
						openrouter: await openrouter.balance(),
						stt_limit: settings.sttDailyMinutes,
						daily_videos: settings.dailyVideos,
						bonus_videos: settings.bonusVideos,
						admin_ids: [...settings.adminIds].sort((a, b) => a - b),
						support_chat_id: settings.supportChatId,
					},
					{ 'Cache-Control': 'no-store' },
				)
			}

			const userId = Number((avatar ?? bonus)![1])
			if (!Number.isInteger(userId)) return json(res, 404, { error: 'not found' })

			if (avatar) {
				const file = await profiles.avatar(userId)
				if (!file) return json(res, 404, { error: 'not found' })
				res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' })
				res.end(await readFile(file))
				return
			}

			// adds bonusVideos to the user's quota for today and tells them about it
			const n = settings.bonusVideos
			const total = settings.dailyVideos + db.grantVideos(userId, n)
			let notified = true
			try {
				await profiles.api.sendMessage(userId, texts.BONUS(n, total))
			} catch (e) {
				if (!isTelegramError(e)) throw e
				console.warn(`could not tell user ${userId} about the bonus`, e)
				notified = false
			}
			return json(res, 200, { limit: total, notified })
		} catch (e) {
			console.error('admin request failed', e)
			if (!res.headersSent) json(res, 500, { error: 'internal' })
		}
	}
}

export async function serve(api: ProfilesApi, db: Db, settings: Settings): Promise<Server> {
	const openrouter = new OpenRouter(settings.stt.url, settings.stt.key)
	const server = createServer(makeHandler(db, settings, openrouter, new Profiles(api, db, settings)))
	await new Promise<void>((resolve) => server.listen(settings.adminPort, '0.0.0.0', resolve))
	console.info(`admin panel on port ${settings.adminPort}`)
	return server
}
