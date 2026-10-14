import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { goldenJson } from '#bot/core/fixtures.ts'
import { NoSpeech, parse, recognize, SttError } from '#bot/core/transcribe.ts'

const CFG = { url: 'https://stt.test/v1/', key: 'k', model: 'whisper-x' }
const TEXT = 'Я хочу, чтобы детей были взрослые достойны.'
const RESPONSE = {
	text: TEXT,
	duration: 5,
	words: 'Я хочу чтобы детей были взрослые достойны'
		.split(' ')
		.map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 })),
}

const audio = join(mkdtempSync(join(tmpdir(), 'sublya-')), 'audio.wav')

writeFileSync(audio, 'RIFF')

const noSleep = async () => {}

/** A fetch that answers with the given responses in turn and remembers the requests. */
function server(...responses: Response[]) {
	const seen: { url: string; init: RequestInit }[] = []
	const fetch = async (url: string | URL | Request, init?: RequestInit) => {
		seen.push({ url: String(url), init: init! })

		return responses.shift()!
	}

	return { fetch: fetch as typeof globalThis.fetch, seen }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

test('words come back with the punctuation of the full text', async () => {
	const { fetch, seen } = server(json(RESPONSE))
	const words = await recognize(audio, CFG, null, { fetch })

	assert.deepEqual(
		words.map((w) => w.text),
		TEXT.split(' '),
	)

	assert.deepEqual([words[1].start, words[1].end], [0.5, 0.9])
	const [{ url, init }] = seen

	assert.equal(url, 'https://stt.test/v1/audio/transcriptions')
	assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer k')
	const form = init.body as FormData

	assert.equal(form.get('model'), 'whisper-x')
	assert.equal(form.get('timestamp_granularities[]'), 'word')
	assert.equal(form.get('language'), null)
})

test('the language goes along when known', async () => {
	const { fetch, seen } = server(json(RESPONSE))

	await recognize(audio, CFG, 'ru', { fetch })
	assert.equal((seen[0].init.body as FormData).get('language'), 'ru')
})

test('server errors and rate limits are retried', async () => {
	const { fetch } = server(new Response('', { status: 503 }), new Response('', { status: 429 }), json(RESPONSE))

	assert.equal((await recognize(audio, CFG, null, { fetch, sleep: noSleep })).length, 7)
})

test('it gives up after the retries', async () => {
	const { fetch } = server(...Array.from({ length: 4 }, () => new Response('', { status: 500 })))

	await assert.rejects(recognize(audio, CFG, null, { fetch, sleep: noSleep }), SttError)
})

test('client errors are not retried', async () => {
	const { fetch } = server(new Response('', { status: 401 }), json(RESPONSE))

	await assert.rejects(recognize(audio, CFG, null, { fetch, sleep: noSleep }), SttError)
})

test('silence is no speech', async () => {
	const { fetch } = server(json({ text: '', words: [] }))

	await assert.rejects(recognize(audio, CFG, null, { fetch }), NoSpeech)
})

test('a response without word timestamps is an error', async () => {
	const { fetch } = server(json({ text: 'Я хочу' }))

	await assert.rejects(recognize(audio, CFG, null, { fetch }), /word/)
})

const response = (...words: string[]) => ({
	text: words.join(' '),
	words: words.map((word, i) => ({ word, start: i * 0.5, end: i * 0.5 + 0.4 })),
})
const texts = (words: { text: string }[]) => words.map((w) => w.text)

test('subtitle credits Whisper hallucinates at the edges are dropped', () => {
	const heard = parse(
		response(
			'Продолжение',
			'следует...',
			'Братишки,',
			'хочу',
			'порекомендовать',
			'бота.',
			'Субтитры',
			'сделал',
			'DimaTorzok',
		),
	)

	assert.deepEqual(texts(heard), ['Братишки,', 'хочу', 'порекомендовать', 'бота.'])
	assert.equal(heard[0].start, 1)
})

test('the same words in the middle stay', () => {
	const words = ['Я', 'сказал:', 'продолжение', 'следует,', 'и', 'ушёл.']

	assert.deepEqual(texts(parse(response(...words))), words)
})

test('a hallucination alone means no speech', () => {
	assert.throws(() => parse(response('Продолжение', 'следует...')), NoSpeech)
})

test('a real response parses as in the Python bot', () => {
	const { response: raw, words } = goldenJson('parse.json')

	assert.deepEqual(parse(raw), words)
})

test('a body that breaks off halfway is retried', async () => {
	const broken = new Response(
		new ReadableStream({
			start(controller) {
				controller.error(new TypeError('terminated'))
			},
		}),
	)
	const { fetch } = server(broken, json(RESPONSE))

	assert.equal((await recognize(audio, CFG, null, { fetch, sleep: noSleep })).length, 7)
})

test('the reason of a failed request reaches the admin', async () => {
	const fetch = (async () => {
		throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') })
	}) as unknown as typeof globalThis.fetch

	await assert.rejects(recognize(audio, CFG, null, { fetch, sleep: noSleep }), /ECONNREFUSED/)
})
