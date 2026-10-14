// Как субтитры разбиваются на экраны и как выглядит каждый стиль. Бот вшивает их в видео
// через libass, сайт рисует поверх оригинала, и оба берут это отсюда.

import { typographText } from '#shared/typograph.ts'

/** Слово со временем показа. `line_end` -- из эталонного текста, на нём экран заканчивается. */
export type Word = { text: string; start: number; end: number; line_end: boolean }

/** Стили субтитров. В этом же порядке идут кнопки выбора стиля в боте. */
export const STYLES = ['classic', 'big', 'box', 'single'] as const
export type Style = (typeof STYLES)[number]
export const DEFAULT_STYLE: Style = 'classic'

export const isStyle = (value: string): value is Style => (STYLES as readonly string[]).includes(value)

export const PAGE_GAP = 0.6 // Пауза длиннее этой (в секундах) начинает новый экран.
export const PER_PAGE = 3
export const MAX_CHARS = 24
export const TAIL = 0.5 // Сколько висит последнее слово, если за ним ничего нет.

/** Длина так, как её считает Python, в кодпоинтах: эмодзи -- один символ, а не два. */
export const chars = (text: string) => [...text].length

/** Как выглядит стиль. По этим числам рисуют и бот (ASS), и сайт (stage.css). */
export type Preset = {
	/** Размер шрифта как доля ширины кадра. */
	font: number
	/** Отступ снизу как доля высоты кадра. */
	margin: number
	/** Раскладка как на нампаде, как в ASS: 2 -- снизу по центру, 5 -- посередине. */
	alignment: 2 | 5
	/** Максимум слов на экране. */
	perPage: number
	/** Максимум символов на экране, вместе с пробелами. */
	maxChars: number
	/** Цвет подсвеченного слова. */
	hi: 'yellow' | 'white'
	/** Подсвеченное слово лежит на розовой плашке вместо обводки. */
	box: boolean
	/** Отступы слева и справа как доля ширины кадра. */
	side: number
}

const base = {
	alignment: 2,
	perPage: PER_PAGE,
	maxChars: MAX_CHARS,
	hi: 'yellow',
	box: false,
	side: 0.08,
} as const satisfies Partial<Preset>

export const presets: Record<Style, Preset> = {
	classic: { ...base, font: 0.065, margin: 0.14 },
	big: { ...base, font: 0.09, margin: 0.25, maxChars: 18 },
	box: { ...base, font: 0.065, margin: 0.14, hi: 'white', box: true },
	single: { ...base, font: 0.12, margin: 0, alignment: 5, perPage: 1, hi: 'white' },
}

/**
 * Разбивает слова на экраны.
 *
 * Новый экран начинается, когда на текущем уже `perPage` слов или следующее слово
 * не влезает в `maxChars`, а также после конца строки эталонного текста (`line_end`),
 * паузы длиннее `PAGE_GAP` и слова, которое заканчивается на `.?!…`.
 */
export function paginate(words: Word[], perPage = PER_PAGE, maxChars = MAX_CHARS): Word[][] {
	const pages: Word[][] = []
	let page: Word[] = []

	for (const w of words) {
		const last = page.at(-1)

		if (
			last &&
			(page.length >= perPage ||
				last.line_end ||
				w.start - last.end > PAGE_GAP ||
				'.?!…'.includes(last.text.at(-1)!) ||
				page.reduce((n, x) => n + chars(x.text) + 1, 0) + chars(w.text) > maxChars)
		) {
			pages.push(page)
			page = []
		}

		page.push(w)
	}

	if (page.length) pages.push(page)

	return pages
}

/** Нельзя ли рвать пробел между двумя словами: короткое слово держится за следующее. */
export const glued = (a: string, b: string) => !typographText(`${a} ${b}`).includes(' ')
