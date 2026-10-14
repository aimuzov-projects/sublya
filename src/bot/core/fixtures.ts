// Запись natasha для тестов: распознанные слова, паузы и эталонное стихотворение настоящего
// видео, плюс то, что из них сделал Python-бот (`golden/`).

import { readFileSync } from 'node:fs'

import { fromJson, type Transcript } from '#bot/core/models.ts'
import type { Word } from '#shared/subtitles.ts'

const read = (path: string) => readFileSync(new URL(`fixtures/${path}`, import.meta.url), 'utf8')

/** DTW в whisper.cpp ставит метки токенов чуть позже. */
export const LAG = 0.15

/** Распознавание с одной меткой на слово (`mark`), как от DTW в whisper.cpp. */
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

/** То же видео, распознанное whisper-large-v3-turbo через OpenRouter. */
export const apiTranscript = () => fromJson(read('natasha/openrouter.json'))

export const poem = () => read('natasha/poem.txt')

export const golden = (name: string) => read(`golden/${name}`)
export const goldenJson = (name: string) => JSON.parse(golden(name))
