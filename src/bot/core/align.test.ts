import assert from 'node:assert/strict'
import { test } from 'node:test'

import { align, readText, snap } from '#bot/core/align.ts'
import { apiTranscript, goldenJson, LAG, markTranscript, poem } from '#bot/core/fixtures.ts'
import { SequenceMatcher } from '#bot/core/sequence-matcher.ts'
import { paginate } from '#shared/subtitles.ts'

const expected = goldenJson('align.json')
const transcript = markTranscript()

test('the timings match the Python bot to the last digit', () => {
	const api = apiTranscript()

	assert.deepEqual(snap(transcript.words, transcript.silences, transcript.duration, LAG), expected.snap_mark)
	assert.deepEqual(align(transcript, poem(), LAG), expected.align_mark_poem)
	assert.deepEqual(align(transcript, null, LAG), expected.align_mark)
	assert.deepEqual(align(api, poem()), expected.align_api_poem)
	assert.deepEqual(align(api), expected.align_api)
	assert.deepEqual(readText(poem()), expected.read_poem)
})

test('screens split as in the Python bot', () => {
	const words = align(transcript, poem(), LAG)

	for (const [key, sizes] of Object.entries(expected.paginate)) {
		const [n, c] = key.split(':').map(Number)

		assert.deepEqual(
			paginate(words, n, c).map((p) => p.length),
			sizes,
			key,
		)
	}
})

test('SequenceMatcher gives the opcodes of difflib', () => {
	for (const { a, b, ops } of goldenJson('matcher.json')) {
		assert.deepEqual(new SequenceMatcher(a, b).opcodes(), ops, `${a.join('')} / ${b.join('')}`)
	}
})

test('snap moves a word start to the end of a pause', () => {
	const ya = snap(transcript.words, transcript.silences, transcript.duration, LAG).filter((w) => w.text === 'Я')

	assert.ok(Math.abs(ya[1].start - 13.97) < 0.01)
})

test('snap leaves its input alone', () => {
	const before = transcript.words.map((w) => [w.start, w.end])

	snap(transcript.words, transcript.silences, transcript.duration, LAG)

	assert.deepEqual(
		transcript.words.map((w) => [w.start, w.end]),
		before,
	)
})

test('align takes the wording of the reference', () => {
	assert.deepEqual(
		align(transcript, poem(), LAG).map((w) => w.text),
		readText(poem()).map((w) => w.text),
	)
})

test('align drops a word that was heard but is not in the reference', () => {
	const words = align(transcript, poem(), LAG)
	const i = words.findIndex((w, i) => w.text === 'Чтобы' && words[i + 1].text === 'добрым')

	assert.notEqual(words[i - 1].text, 'и')
})

test('short words get some time on screen', () => {
	const words = align(transcript, poem(), LAG)
	const i = words.findIndex((w, i) => w.text === 'И' && words[i + 1].text === 'о')

	assert.ok(words[i].end > words[i].start)
	assert.ok(words[i + 1].end > words[i + 1].start)
})

test('line ends of the reference are kept', () => {
	const words = align(transcript, poem(), LAG)
	const lines = poem()
		.split('\n')
		.filter((l) => l.trim())
		.map((l) => l.split(/\s+/).filter(Boolean))

	assert.deepEqual(
		words.filter((w) => w.line_end).map((w) => w.text),
		lines.map((l) => (l.at(-1) !== '—' ? l.at(-1) : `${l.at(-2)} —`)),
	)
})

test('a lone dash sticks to the word before it', () => {
	const words = readText('То летит не кто-нибудь —\nЭто')

	assert.deepEqual(
		words.map((w) => w.text),
		['То', 'летит', 'не', 'кто-нибудь —', 'Это'],
	)

	assert.ok(words[3].line_end && !words[2].line_end)
})

test('API timings land where the hand-checked DTW put them', () => {
	const reference = align(transcript, poem(), LAG)
	const words = align(apiTranscript(), poem())
	const errors = words.map((w, i) => Math.abs(w.start - reference[i].start)).sort((x, y) => x - y)

	assert.ok(errors[Math.floor(errors.length / 2)] < 0.05, 'median')
	assert.ok(errors.reduce((s, e) => s + e, 0) / errors.length < 0.1, 'mean')
	assert.ok(errors.at(-1)! < 0.5, 'worst')
})

test('span snapping keeps starts in order', () => {
	const words = align(apiTranscript())

	words.slice(1).forEach((w, i) => assert.ok(words[i].start <= w.start))
	words.forEach((w) => assert.ok(w.end >= w.start))
})
