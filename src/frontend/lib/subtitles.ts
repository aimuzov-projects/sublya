// The bot's subtitles, drawn by the page over the original video instead of burning them in:
// the same screens and styles from src/shared/subtitles.ts, timed the way the bot's ASS is.

import { glued, paginate, TAIL, type Preset, type Word } from '#shared/subtitles.ts'

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
			glue: page.map((w, i) => i + 1 < page.length && glued(w.text, page[i + 1].text)),
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
