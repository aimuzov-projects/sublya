// The bot's subtitle layout, drawn by the page over the original video instead of burning it
// in: the same screens and the same four styles as src/bot/sublya/core/{align,render}.py.

import { typographText } from '#frontend/lib/typograph.ts'

export type Word = { text: string; start: number; end: number; line_end: boolean }

export type Preset = {
	/** Font size as a share of frame width. */
	font: number
	/** Bottom margin as a share of frame height; 0 with `middle` set. */
	margin: number
	middle: boolean
	perPage: number
	maxChars: number
	/** The lit word's colour; `box` puts it on a pink plate instead. */
	hi: string
	box: boolean
	/** Left and right margins as a share of frame width. */
	side: number
}

const PAGE_GAP = 0.6 // a pause longer than this starts a new page
const PER_PAGE = 3
const MAX_CHARS = 24
export const TAIL = 0.5 // how long the last word lingers when nothing follows it

const base = { middle: false, perPage: PER_PAGE, maxChars: MAX_CHARS, hi: '#ffff00', box: false, side: 0.08 }

export const presets: Record<string, Preset> = {
	classic: { ...base, font: 0.065, margin: 0.14 },
	big: { ...base, font: 0.09, margin: 0.25, maxChars: 18 },
	box: { ...base, font: 0.065, margin: 0.14, hi: '#ffffff', box: true },
	single: { ...base, font: 0.12, margin: 0, middle: true, perPage: 1, hi: '#ffffff' },
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
				page.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length > maxChars)
		) {
			pages.push(page)
			page = []
		}
		page.push(w)
	}
	if (page.length) pages.push(page)
	return pages
}

export type Screen = {
	words: string[]
	/** Whether the space after each word must not break: a short word stays with the next one. */
	glue: boolean[]
	/** When each word lights up and goes out, as the ASS events of the bot. */
	spans: [number, number][]
}

/** Screens with their timings: each word stays lit until the next one starts. */
export function screens(words: Word[], preset: Preset): Screen[] {
	const pages = paginate(words, preset.perPage, preset.maxChars)
	return pages.map((page, n) => {
		const nextPage = pages[n + 1]?.[0].start ?? Infinity
		return {
			words: page.map((w) => w.text.toUpperCase()),
			glue: page.map(
				(w, i) => i + 1 < page.length && !typographText(`${w.text} ${page[i + 1].text}`).includes(' '),
			),
			spans: page.map((w, i) => [
				w.start,
				i + 1 < page.length ? page[i + 1].start : Math.min(w.end + TAIL, nextPage),
			]),
		}
	})
}

/** The screen and its lit word at moment `t`, or null between screens. */
export function at(list: Screen[], t: number): { screen: Screen; lit: number } | null {
	for (const screen of list) {
		const lit = screen.spans.findIndex(([start, end]) => start <= t && t < end)
		if (lit >= 0) return { screen, lit }
	}
	return null
}
