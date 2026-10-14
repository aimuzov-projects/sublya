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

const ids = (value: string) =>
	new Set(
		value
			.split(/[\s,]+/)
			.filter(Boolean)
			.map(Number),
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
		supportChatId: env.SUPPORT_CHAT_ID ? Number(env.SUPPORT_CHAT_ID) : null,
		adminUrl: env.ADMIN_URL || null,
		adminPort: Number(env.ADMIN_PORT || 8090),
		dailyVideos: Number(env.DAILY_VIDEOS || 10),
		bonusVideos: Number(env.BONUS_VIDEOS || 10),
		sttDailyMinutes: Number(env.STT_DAILY_MINUTES || 300),
		sttLag: env.STT_LAG ? Number(env.STT_LAG) : null,
		defaultLang: (env.DEFAULT_LANG ?? 'ru') || null,
		stt,
	}
}

export const downloadLimit = (s: Settings) => (s.apiUrl ? s.maxSize : Math.min(s.maxSize, CLOUD_DOWNLOAD_LIMIT))
export const jobsDir = (s: Settings) => join(s.dataDir, 'jobs')
