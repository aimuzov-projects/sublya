import { join } from 'node:path'

import { sttFromEnv, type SttConfig } from '#bot/core/transcribe.ts'

export const MB = 1024 * 1024
// the public Bot API refuses to hand out files bigger than this
const CLOUD_DOWNLOAD_LIMIT = 20 * MB

export type Settings = {
	botToken: string
	/** Local telegram-bot-api server, e.g. http://telegram-bot-api:8081. */
	apiUrl: string | null
	dataDir: string
	adminIds: Set<number>
	/** Forum group where every user gets a topic with their dialogue; null turns support off. */
	supportChatId: number | null
	/** Public address of the admin Mini App; null keeps its web server off. */
	adminUrl: string | null
	adminPort: number
	dailyVideos: number
	/** What one "+N" press in the admin panel adds for today. */
	bonusVideos: number
	sttDailyMinutes: number
	/** null: the default for the transcript's timing kind. */
	sttLag: number | null
	/** Recognition language for users who never picked one; null means autodetect. */
	defaultLang: string | null
	maxDuration: number
	maxSize: number
	jobTtl: number
	stt: SttConfig
}

export const defaults = {
	apiUrl: null,
	dataDir: 'data',
	adminIds: new Set<number>(),
	supportChatId: null,
	adminUrl: null,
	adminPort: 8090,
	dailyVideos: 10,
	bonusVideos: 10,
	sttDailyMinutes: 300,
	sttLag: null,
	defaultLang: 'ru',
	maxDuration: 180,
	maxSize: 200 * MB,
	jobTtl: 24 * 3600,
} satisfies Partial<Settings>

// a typo must stop the start, not turn into NaN: "123;456" would leave the bot without admins
function number(name: string, value: string): number {
	const n = Number(value)
	if (!value.trim() || !Number.isFinite(n)) throw new Error(`${name} is not a number: ${value}`)
	return n
}

function int(name: string, value: string): number {
	const n = number(name, value)
	if (!Number.isSafeInteger(n)) throw new Error(`${name} is not an integer: ${value}`)
	return n
}

const ids = (value: string) =>
	new Set(
		value
			.split(/[\s,]+/)
			.filter(Boolean)
			.map((id) => int('ADMIN_IDS', id)),
	)

export function fromEnv(env = process.env): Settings {
	const botToken = env.BOT_TOKEN
	if (!botToken) throw new Error('BOT_TOKEN is not set')
	const stt = sttFromEnv(env)
	if (!stt.key) throw new Error('STT_API_KEY is not set')
	return {
		...defaults,
		botToken,
		apiUrl: env.TELEGRAM_API_URL || null,
		dataDir: env.DATA_DIR || 'data',
		adminIds: ids(env.ADMIN_IDS ?? ''),
		supportChatId: env.SUPPORT_CHAT_ID ? int('SUPPORT_CHAT_ID', env.SUPPORT_CHAT_ID) : null,
		adminUrl: env.ADMIN_URL || null,
		adminPort: int('ADMIN_PORT', env.ADMIN_PORT || '8090'),
		dailyVideos: int('DAILY_VIDEOS', env.DAILY_VIDEOS || '10'),
		bonusVideos: int('BONUS_VIDEOS', env.BONUS_VIDEOS || '10'),
		sttDailyMinutes: number('STT_DAILY_MINUTES', env.STT_DAILY_MINUTES || '300'),
		sttLag: env.STT_LAG ? number('STT_LAG', env.STT_LAG) : null,
		defaultLang: (env.DEFAULT_LANG ?? 'ru') || null,
		stt,
	}
}

export const downloadLimit = (s: Settings) => (s.apiUrl ? s.maxSize : Math.min(s.maxSize, CLOUD_DOWNLOAD_LIMIT))
export const jobsDir = (s: Settings) => join(s.dataDir, 'jobs')
