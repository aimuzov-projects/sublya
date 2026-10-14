// Всё, что бот говорит пользователям.

import type { Style } from '#shared/subtitles.ts'

export const START = `Пришли видео, и я прожгу в нём субтитры как в тиктоке: на экране пара слов, произносимое подсвечено.

Если в подписи к видео есть текст (стих, сценарий), на экране будет он, а тайминги я возьму из речи. Переносы строк в тексте станут сменой экрана.

/style — стиль по умолчанию
/lang — язык речи`

export const STYLE_NAMES: Record<Style, string> = {
	classic: '📝 Классика',
	big: '🔠 Крупно',
	box: '🟨 Плашка',
	single: '☝️ По слову',
}

export const CHOOSE_STYLE = (current: string) => `Какой стиль ставить по умолчанию? Сейчас: ${current}.`
export const STYLE_SET = (name: string) => `Стиль по умолчанию: ${name}.`
export const CHOOSE_LANG = (current: string) => `На каком языке говорят в видео? Сейчас: ${current}.`
export const LANG_SET = (name: string) => `Язык: ${name}.`
export const LANG_AUTO = 'автоопределение'
export const LANG_NAMES: Record<string, string> = {
	ru: 'русский',
	en: 'английский',
	uk: 'украинский',
	kk: 'казахский',
}
export const LANG_FLAGS: Record<string, string> = { ru: '🇷🇺', en: '🇬🇧', uk: '🇺🇦', kk: '🇰🇿' }

export const QUEUED = (position: number) => `⏳ В очереди, позиция ${position}. Займи место и не толкайся.`
// Воркер показывает их по очереди, пока идёт этап, поэтому каждая строка должна быть
// понятна сама по себе.
export const RECOGNIZING = [
	'👂 Слушаю, что ты там наговорил…',
	'🎧 Надел наушники, разбираю каждое слово…',
	'🧐 Расшифровываю твою дикцию…',
	'📝 Стенографирую, как на допросе…',
	'🤔 Так, а вот тут ты что сказал?..',
	'🦻 Прислушиваюсь к шёпоту на фоне…',
	'🗣 Перевожу с человеческого на буквы…',
	'🔍 Ищу слова между вздохами…',
]
export const RENDERING = [
	'🔥 Прожигаю субтитры…',
	'🎬 Монтирую, как в лучших тиктоках…',
	'🖍 Раскрашиваю слова по одному…',
	'⚙️ ffmpeg пыхтит, вентиляторы воют…',
	'✨ Посыпаю видео буквами…',
	'🧑‍🍳 Готовлю ролик, осталось красиво подать…',
	'🎞 Склеиваю кадр за кадром…',
	'☕️ Рендер не быстрый, но я стараюсь…',
]

export const BTN_FIX = '✏️ Текст'
export const BTN_STYLE = '🎨 Стиль'
export const BTN_BACK = '⬅️ Назад'
export const BTN_AUTO = '🌐 Авто'

export const FIX_PROMPT =
	'Вот что я услышал. Пришли исправленный текст или стих целиком, и я перерендерю видео. Переносы строк станут сменой экрана.'
export const FIX_WAITING = 'Жду текст для видео. Если передумал, отправь /cancel.'
export const CANCELLED = 'Ладно, отменил.'

export const NOT_VIDEO = 'Это не похоже на видео. Пришли видео файлом или обычным видео.'
export const FORWARDED = 'Передал сообщение автору бота, ответ придёт сюда. А для субтитров пришли видео.'
export const TOO_LONG = (minutes: number) => `Видео длиннее ${minutes} мин, такие я пока не беру.`
export const TOO_BIG = (mb: number) => `Файл больше ${mb} МБ, такие я не скачаю. Попробуй сжать видео.`
export const BUSY = 'Я ещё занят твоим прошлым видео. Дождись его, потом присылай следующее.'
export const QUOTA = (daily: number) => `На сегодня лимит в ${daily} видео исчерпан. Приходи завтра.`
export const BONUS = (n: number, total: number) =>
	`Тебе добавили ${n} видео на сегодня, теперь лимит на сегодня ${total}.`
export const STT_LIMIT = 'Сегодня бот распознал слишком много речи и упёрся в дневной лимит. Попробуй завтра.'
export const EXPIRED = 'Файлы этого видео уже удалены. Пришли его заново.'
export const NOT_YOURS = 'Это не твоё видео.'
export const DOWNLOAD_FAILED = 'Не получилось скачать видео. Попробуй ещё раз.'

export const NO_SPEECH = 'Не нашёл речи в видео.'
export const STT_FAILED = 'Не получилось распознать речь. Попробуй позже.'
export const RENDER_FAILED = 'Не получилось собрать видео. Я уже сообщил разработчику.'
export const FAILED = 'Что-то сломалось. Я уже сообщил разработчику.'

export const SUPPORT_CARD = ({
	name,
	username,
	id,
	lang,
}: {
	name: string
	username: string
	id: number
	lang: string
}) =>
	`<b>${name}</b>
${username}id <code>${id}</code>, язык Telegram: ${lang}

<i>Здесь вся переписка с пользователем. Что напишешь в эту тему, бот отправит ему от своего имени. Сообщения с / не уходят.</i>`
export const SUPPORT_BOT = (text: string) => `🤖 ${text}`
export const SUPPORT_BUTTON = (text: string) => `🔘 ${text}`
export const SUPPORT_NO_USER = '⚠️ Эта тема ни к кому не привязана, сообщение не ушло.'
export const SUPPORT_BLOCKED = '⚠️ Не доставлено: пользователь заблокировал бота.'
export const SUPPORT_FAILED = (error: string) => `⚠️ Не доставлено: ${error}`

export const ADMIN_PANEL = 'Пользователи, видео и баланс OpenRouter:'
export const BTN_ADMIN = 'Открыть админку'

export const ADMIN_ERROR = (jobId: number, userId: number, error: string) =>
	`Задача ${jobId} (user ${userId}) упала: ${error}`
export const STATS = (s: {
	users_today: number
	users_total: number
	videos_today: number
	stt_minutes_today: number
	stt_limit: number
	queued: number
	failed_today: number
}) => `Сегодня:
пользователей ${s.users_today} (всего ${s.users_total})
видео ${s.videos_today}
распознано ${s.stt_minutes_today} мин из ${s.stt_limit}
в очереди ${s.queued}, ошибок ${s.failed_today}`
