import type { Word } from '#shared/subtitles.ts'

/**
 * Что распознавание выдало для видео.
 * Кешируется на задачу, поэтому повторный рендер обходится без STT.
 */
export type Transcript = {
	words: Word[]
	silences: [number, number][]
	size: [number, number]
	duration: number
	// "span": у слова есть начало и конец, как отдаёт Whisper API;
	// "mark": у слова одна точка во времени, как даёт DTW в whisper.cpp.
	timing: 'span' | 'mark'
	lang: string | null
}

export const transcriptText = (t: Transcript) => t.words.map((w) => w.text).join(' ')

/** Тот же JSON, что кешировал Python-бот, поэтому папки задач пережили переезд. */
export const toJson = (t: Transcript) =>
	JSON.stringify(
		{ words: t.words, silences: t.silences, size: t.size, duration: t.duration, timing: t.timing, lang: t.lang },
		null,
		1,
	)

export function fromJson(data: string): Transcript {
	const d = JSON.parse(data)

	return {
		words: d.words.map((w: Word) => ({ text: w.text, start: w.start, end: w.end, line_end: w.line_end ?? false })),
		silences: d.silences,
		size: d.size,
		duration: d.duration,
		timing: d.timing ?? 'span',
		lang: d.lang ?? null,
	}
}
