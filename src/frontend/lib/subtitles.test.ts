import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { at, paginate, presets, screens, TAIL, type Word } from './subtitles.ts'

const demo = (id: string): Word[] =>
	JSON.parse(readFileSync(new URL(`../data/words/${id}.json`, import.meta.url), 'utf8'))

// page sizes from paginate() in src/bot/sublya/core/align.py on the same words
const python: Record<string, Record<string, number[]>> = {
	samara: {
		classic: [3, 3, 1, 3, 3, 3, 1, 3, 1],
		big: [3, 3, 1, 3, 3, 3, 1, 2, 2],
	},
	bratishki: {
		classic: [2, 1, 2, 1, 3, 3, 1, 3, 2, 1, 3, 3, 2],
		big: [1, 2, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 2, 1, 2],
	},
	velo: {
		classic: [3, 3, 3, 2, 3, 1],
		big: [2, 1, 3, 2, 1, 1, 1, 3, 1],
	},
}

for (const [id, styles] of Object.entries(python)) {
	for (const [style, sizes] of Object.entries(styles)) {
		test(`${id} in ${style} splits into the same screens as the bot`, () => {
			const p = presets[style]
			assert.deepEqual(
				paginate(demo(id), p.perPage, p.maxChars).map((page) => page.length),
				sizes,
			)
		})
	}
}

test('single shows one word per screen', () => {
	const words = demo('velo')
	assert.equal(screens(words, presets.single).length, words.length)
})

const words: Word[] = [
	{ text: 'раз', start: 1, end: 1.3, line_end: false },
	{ text: 'два.', start: 1.4, end: 1.8, line_end: false },
	{ text: 'три', start: 3, end: 3.4, line_end: false },
]

test('a word stays lit until the next one starts', () => {
	const [first] = screens(words, presets.classic)
	assert.deepEqual(first.spans[0], [1, 1.4])
	assert.equal(at(screens(words, presets.classic), 1.35)?.lit, 0)
})

test('the last word of a screen lingers, but not into the next screen', () => {
	const list = screens(words, presets.classic)
	assert.deepEqual(list[0].spans[1], [1.4, 1.8 + TAIL])
	assert.equal(at(list, 2.5), null)
	assert.equal(at(list, 3.1)?.screen, list[1])
})

test('words are shown in capitals, as the bot burns them', () => {
	assert.deepEqual(screens(words, presets.classic)[0].words, ['РАЗ', 'ДВА.'])
})
