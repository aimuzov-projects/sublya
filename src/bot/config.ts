import { join } from 'node:path'

import { sttFromEnv, type SttConfig } from '#bot/core/transcribe.ts'

export const MB = 1024 * 1024
// Публичный Bot API не отдаёт файлы больше этого размера.
const CLOUD_DOWNLOAD_LIMIT = 20 * MB

/** Настройки бота, собранные из переменных окружения (см. {@link fromEnv}). */
export type Settings = {
	botToken: string
	/** Локальный сервер telegram-bot-api, например http://telegram-bot-api:8081. */
	apiUrl: string | null
	dataDir: string
	adminIds: Set<number>
	/**
	 * Группа-форум, где у каждого пользователя свой топик с перепиской.
	 * `null` выключает поддержку.
	 */
	supportChatId: number | null
	/** Публичный адрес админского Mini App; при `null` его веб-сервер не поднимается. */
	adminUrl: string | null
	adminPort: number
	dailyVideos: number
	/** Сколько видео на сегодня добавляет одно нажатие "+N" в админке. */
	bonusVideos: number
	/** Общий на всех дневной бюджет распознавания, в минутах. */
	sttDailyMinutes: number
	/** При `null` берётся значение по умолчанию для вида таймингов транскрипта. */
	sttLag: number | null
	/** Язык распознавания для тех, кто его ни разу не выбирал; `null` включает автоопределение. */
	defaultLang: string | null
	/** Максимальная длительность видео, в секундах. */
	maxDuration: number
	/** Максимальный размер видео, в байтах. */
	maxSize: number
	/** Через сколько секунд папка задачи считается старой и удаляется. */
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

// Опечатка должна ронять старт, а не превращаться в NaN:
// с "123;456" бот остался бы без админов.
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

/**
 * Собирает настройки из переменных окружения.
 *
 * Бросает исключение, если не заданы `BOT_TOKEN` или `STT_API_KEY`,
 * а также если в числовой переменной опечатка.
 */
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

/**
 * Сколько байт бот может скачать за один файл.
 * Через публичный Bot API упираемся еще и в его 20 МБ,
 * у локального сервера такого лимита нет.
 */
export const downloadLimit = (s: Settings) => (s.apiUrl ? s.maxSize : Math.min(s.maxSize, CLOUD_DOWNLOAD_LIMIT))
export const jobsDir = (s: Settings) => join(s.dataDir, 'jobs')
