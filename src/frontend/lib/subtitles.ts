// Субтитры бота, которые страница рисует поверх оригинального видео, а не вшивает в него:
// те же экраны и стили из `src/shared/subtitles.ts`, с теми же таймингами, что в ASS у бота.

import { glued, paginate, TAIL, type Preset, type Word } from '#shared/subtitles.ts'

/** Один экран субтитров: слова, которые видны одновременно. */
export type Screen = {
	/** Слова экрана, уже в верхнем регистре. */
	words: string[]
	/** Нельзя ли переносить строку после слова: короткое слово держится за следующее. */
	glue: boolean[]
	/** Когда каждое слово загорается и гаснет, как события в ASS у бота. */
	spans: [number, number][]
}

/**
 * Экраны с таймингами: слово горит, пока не начнётся следующее.
 *
 * Последнее слово экрана гаснет через `TAIL` после своего конца,
 * но не позже, чем начнётся следующий экран.
 */
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

/** Экран и горящее на нём слово в момент `t`, или `null` между экранами. */
export function at(list: Screen[], t: number): { screen: Screen; lit: number } | null {
	for (const screen of list) {
		const lit = screen.spans.findIndex(([start, end]) => start <= t && t < end)

		if (lit >= 0) return { screen, lit }
	}

	return null
}
