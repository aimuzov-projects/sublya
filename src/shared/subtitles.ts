// How subtitles fall into screens and what each style looks like. The bot burns them into the
// video with libass, the site draws them over the original one, both from here.

import { typographText } from '#shared/typograph.ts'

/** A word with its time on screen. `line_end` comes from the reference text: a screen ends there. */
export type Word = { text: string; start: number; end: number; line_end: boolean }

export const STYLES = ['classic', 'big', 'box', 'single'] as const
export type Style = (typeof STYLES)[number]
export const DEFAULT_STYLE: Style = 'classic'

export const isStyle = (value: string): value is Style => (STYLES as readonly string[]).includes(value)

export const PAGE_GAP = 0.6 // a pause longer than this starts a new screen
export const PER_PAGE = 3
export const MAX_CHARS = 24
export const TAIL = 0.5 // how long the last word lingers when nothing follows it

/** Length as Python counts it, in code points: an emoji is one character, not two. */
export const chars = (text: string) => [...text].length

export type Preset = {
	/** Font size as a share of frame width. */
	font: number
	/** Bottom margin as a share of frame height. */
	margin: number
	/** Numpad layout, as in ASS: 2 is bottom centre, 5 is middle centre. */
	alignment: 2 | 5
	perPage: number
	maxChars: number
	/** The lit word's colour. */
	hi: 'yellow' | 'white'
	/** The lit word sits on a pink plate instead of an outline. */
	box: boolean
	/** Left and right margins as a share of frame width. */
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

/** Whether the space between two words must not break: a short word stays with the next one. */
export const glued = (a: string, b: string) => !typographText(`${a} ${b}`).includes(' ')
