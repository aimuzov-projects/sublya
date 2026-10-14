// Speech recognition through any OpenAI-compatible audio/transcriptions endpoint.

import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { applyText, normalize, readText } from '#bot/core/align.ts'
import { duration, extractAudio, silences, videoSize } from '#bot/core/audio.ts'
import type { Transcript } from '#bot/core/models.ts'
import type { Word } from '#shared/subtitles.ts'

export const DEFAULT_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_MODEL = 'openai/whisper-large-v3-turbo'
const BACKOFF = [1, 2, 4]
const TIMEOUT = 120_000

export class SttError extends Error {}
export class NoSpeech extends SttError {}

export type SttConfig = { url: string; key: string; model: string }

export const sttFromEnv = (env = process.env): SttConfig => ({
	url: env.STT_API_URL || DEFAULT_URL,
	key: env.STT_API_KEY ?? '',
	model: env.STT_MODEL || DEFAULT_MODEL,
})

// Whisper learned from subtitle files, and over silence or noise at the start or end of a
// recording it writes their credits. Nobody says these in a video, unlike "thank you".
const HALLUCINATIONS = [
	'продолжение следует',
	'субтитры сделал dimatorzok',
	'субтитры создавал dimatorzok',
	'субтитры подогнал симон',
	'редактор субтитров асемкин корректор аегорова',
].map((phrase) => phrase.split(' '))

export function dropHallucinations(words: Word[]): Word[] {
	const keys = words.map((w) => normalize(w.text))
	const same = (from: number, phrase: string[]) => phrase.every((p, i) => keys[from + i] === p)
	let [start, end] = [0, words.length]
	let trimmed = true
	while (trimmed) {
		trimmed = false
		for (const phrase of HALLUCINATIONS) {
			const n = phrase.length
			if (end - start >= n && same(start, phrase)) [start, trimmed] = [start + n, true]
			if (end - start >= n && same(end - n, phrase)) [end, trimmed] = [end - n, true]
		}
	}
	return words.slice(start, end)
}

type Response = { text?: string; words?: { word: string; start: number; end: number }[] }

export function parse(data: Response): Word[] {
	if (!data.words) throw new SttError('the STT response has no word timestamps')
	let heard: Word[] = data.words
		.filter((w) => w.word.trim())
		.map((w) => ({ text: w.word.trim(), start: Number(w.start), end: Number(w.end), line_end: false }))
	// words come without punctuation; the full text has it
	const ref = readText(data.text ?? '')
	if (ref.length) {
		ref.at(-1)!.line_end = false
		heard = applyText(heard, ref)
	}
	heard = dropHallucinations(heard)
	if (!heard.length) throw new NoSpeech('no speech recognised')
	return heard
}

export type Deps = {
	fetch?: typeof fetch
	sleep?: (seconds: number) => Promise<unknown>
}

async function post(audio: string, cfg: SttConfig, lang: string | null, deps: Deps): Promise<Response> {
	const { fetch: request = fetch, sleep = (s: number) => delay(s * 1000) } = deps
	const content = await readFile(audio)
	for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
		const retry = attempt < BACKOFF.length
		const form = new FormData()
		form.set('model', cfg.model)
		form.set('response_format', 'verbose_json')
		form.set('timestamp_granularities[]', 'word')
		if (lang) form.set('language', lang)
		form.set('file', new Blob([content], { type: 'audio/wav' }), basename(audio))
		let resp: globalThis.Response
		try {
			resp = await request(`${cfg.url.replace(/\/+$/, '')}/audio/transcriptions`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${cfg.key}` },
				body: form,
				signal: AbortSignal.timeout(TIMEOUT),
			})
		} catch (e) {
			if (!retry) throw new SttError(`STT request failed: ${e}`, { cause: e })
			await sleep(BACKOFF[attempt])
			continue
		}
		if (resp.ok) return resp.json()
		const failure = `STT returned ${resp.status}: ${(await resp.text()).slice(0, 300)}`
		if ((resp.status !== 429 && resp.status < 500) || !retry) throw new SttError(failure)
		await sleep(BACKOFF[attempt])
	}
	throw new Error('unreachable')
}

export async function recognize(audio: string, cfg: SttConfig, lang: string | null = null, deps: Deps = {}) {
	return parse(await post(audio, cfg, lang, deps))
}

export async function transcribe(
	video: string,
	workdir: string,
	cfg: SttConfig,
	lang: string | null = null,
): Promise<Transcript> {
	const audio = join(workdir, 'audio.wav')
	await extractAudio(video, audio)
	const words = await recognize(audio, cfg, lang)
	return {
		words,
		silences: await silences(audio),
		size: await videoSize(video),
		duration: await duration(audio),
		timing: 'span',
		lang,
	}
}
