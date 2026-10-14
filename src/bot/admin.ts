// Админский Mini App: одна страница и небольшой JSON API, отдаются из процесса бота.
//
// Telegram подписывает initData Mini App токеном бота, поэтому подпись и есть вся
// аутентификация: ни сессий, ни кук, ни отдельных секретов.

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
// Сколько живёт подписанный initData.
// Панель переоткрывают, а не держат открытой сутками.
const MAX_AGE = 24 * 3600
const MAX_INIT_DATA = 8192
const BALANCE_TTL = 60
const AVATAR_TTL = 24 * 3600
const AVATAR_SIZE = 160
const HEALTH_TIMEOUT = 10_000

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
	Promise.race([
		promise,
		new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms).unref()),
	])

/**
 * Возвращает id пользователя Telegram из подписанного initData.
 * `null`, если подпись не сходится или initData слишком старый.
 */
export function verifyInitData(initData: string, botToken: string, now = Date.now() / 1000): number | null {
	if (!initData || initData.length > MAX_INIT_DATA) return null

	const fields = new Map(new URLSearchParams(initData))
	const given = fields.get('hash') ?? ''

	fields.delete('hash')
	// Участвуют все поля, кроме hash, в том числе подпись Ed25519 (`signature`).
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

/** Цифры по ключу OpenRouter в долларах, `null` там, где OpenRouter их не прислал. */
export type Balance = Record<string, number | null>

/**
 * Баланс и расходы по ключу STT.
 *
 * Кешируется, потому что панель могут обновлять часто,
 * а цифры у самого OpenRouter все равно отстают.
 */
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

	/** `null`, если OpenRouter не отвечает или STT вообще смотрит не в OpenRouter. */
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

export type ProfilesApi = Pick<Api, 'getChat' | 'getUserProfilePhotos' | 'getFile' | 'sendMessage' | 'getMe'>
type Named = { user_id: unknown; name: unknown; username: unknown }

/**
 * Имена и аватарки пользователей из списков панели.
 *
 * Тем, кто писал боту ещё до того, как он стал сохранять имена, имя один раз
 * подтягивается через `getChat`. Аватарки лежат на диске `AVATAR_TTL` секунд.
 */
export class Profiles {
	readonly api: ProfilesApi
	readonly db: Db
	readonly settings: Settings
	readonly dir: string
	// У заблокировавших бота `getChat` падает,
	// переспрашивать на каждом обновлении бесполезно.
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
				// Фото нет, или оно скрыто от бота настройками приватности.
				await writeFile(none, '')
				await unlink(path).catch(() => {})

				return null
			}

			const sizes = photos.photos[0]
			const size = sizes.find((s) => s.width >= AVATAR_SIZE) ?? sizes.at(-1)!
			const file = await this.api.getFile(size.file_id)

			if (this.settings.apiUrl) {
				// Локальный сервер Bot API отдаёт путь на общем томе. Копируем, а не переносим,
				// потому что фото профиля он хранит и для себя.
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

/**
 * Обработчик HTTP-запросов админки: страница, health-check и API под подписью initData.
 *
 * Тесты поднимают сервер прямо на нём, со своими зависимостями вместо {@link serve}.
 */
export function makeHandler(db: Db, settings: Settings, openrouter: OpenRouter, profiles: Profiles) {
	/** `null`, если запрос пришёл от админа, иначе статус, с которым отказываем. */
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

			// Для ежечасной проверки из .github/workflows/monitor.yml: `getMe` идёт через локальный
			// сервер Bot API и туннель, поэтому здесь видно и упавший бот, и Bot API, и выход VPN.
			// Подпись не нужна, наружу отдаём только вердикт.
			if (route('GET', /^\/admin\/api\/health$/)) {
				const ok = await withTimeout(profiles.api.getMe(), HEALTH_TIMEOUT).then(
					() => true,
					(e) => {
						console.warn('health check failed', e)

						return false
					},
				)

				return json(res, ok ? 200 : 503, { ok }, { 'Cache-Control': 'no-store' })
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

			// Добавляет `bonusVideos` к квоте пользователя на сегодня и сообщает ему об этом.
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

/** Поднимает веб-сервер админки на `settings.adminPort`. */
export async function serve(api: ProfilesApi, db: Db, settings: Settings): Promise<Server> {
	const openrouter = new OpenRouter(settings.stt.url, settings.stt.key)
	const server = createServer(makeHandler(db, settings, openrouter, new Profiles(api, db, settings)))

	await new Promise<void>((resolve) => server.listen(settings.adminPort, '0.0.0.0', resolve))
	console.info(`admin panel on port ${settings.adminPort}`)

	return server
}
