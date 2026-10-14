// The natasha recording for the tests: recognised words, pauses and the reference poem of a
// real video, plus what the Python bot produced from them (golden/).

import { readFileSync } from 'node:fs'

import { fromJson, type Transcript } from '#bot/core/models.ts'
import type { Word } from '#shared/subtitles.ts'

const read = (path: string) => readFileSync(new URL(`fixtures/${path}`, import.meta.url), 'utf8')

export const LAG = 0.15 // whisper.cpp DTW marks tokens a bit late

export function markTranscript(): Transcript {
	const meta = JSON.parse(read('natasha/silences.json'))

	return {
		words: JSON.parse(read('natasha/words.json')).map((w: Partial<Word>) => ({
			...w,
			line_end: w.line_end ?? false,
		})),
		silences: meta.silences,
		size: [1080, 1920],
		duration: meta.duration,
		timing: 'mark',
		lang: null,
	}
}

/** The same video recognised by whisper-large-v3-turbo through OpenRouter. */
export const apiTranscript = () => fromJson(read('natasha/openrouter.json'))

export const poem = () => read('natasha/poem.txt')

export const golden = (name: string) => read(`golden/${name}`)
export const goldenJson = (name: string) => JSON.parse(golden(name))
