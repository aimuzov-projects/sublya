import type { Word } from '#shared/subtitles.ts'

/** What recognition produced for a video. Cached per job, so re-renders skip the STT call. */
export type Transcript = {
	words: Word[]
	silences: [number, number][]
	size: [number, number]
	duration: number
	// "span": words come with start and end, as from the Whisper API;
	// "mark": a single moment per word, as whisper.cpp DTW gives
	timing: 'span' | 'mark'
	lang: string | null
}

export const transcriptText = (t: Transcript) => t.words.map((w) => w.text).join(' ')

// the same JSON the Python bot cached, so job folders survive the switch
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
