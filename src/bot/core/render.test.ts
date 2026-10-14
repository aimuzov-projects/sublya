import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { align, normalize } from '#bot/core/align.ts'
import { hasFilter, run, tool } from '#bot/core/ffmpeg.ts'
import { golden, LAG, markTranscript, poem } from '#bot/core/fixtures.ts'
import { buildAss, burn, forCircle, HIGHLIGHT, round } from '#bot/core/render.ts'
import { presets, STYLES, type Word } from '#shared/subtitles.ts'

const words = align(markTranscript(), poem(), LAG)
const DIALOGUE = /^Dialogue: (\d+),([\d:.]+),([\d:.]+),[^,]*,[^,]*,\d+,\d+,\d+,[^,]*,(.*)$/

const seconds = (t: string) => {
	const [h, m, s] = t.split(':')

	return Number(h) * 3600 + Number(m) * 60 + Number(s)
}
const events = (ass: string) =>
	ass
		.split('\n')
		.map((line) => line.match(DIALOGUE))
		.filter((m) => m !== null)
		.map((m) => ({ start: seconds(m[2]), end: seconds(m[3]), text: m[4] }))
const visible = (text: string) => text.replace(/\{[^}]*\}/g, '').replaceAll(String.raw`\h`, ' ')

test('round sends halves to the even neighbour, as Python does', () => {
	assert.deepEqual([0.5, 1.5, 2.5, 3.5, 2.4, 2.6].map(round), [0, 2, 2, 4, 2, 3])
})

for (const style of STYLES) {
	test(`${style} gives the ASS of the Python bot byte for byte`, () => {
		assert.equal(buildAss(words, [1080, 1920], style, { glue: false }), golden(`${style}.ass`))
		assert.equal(buildAss(words, [400, 400], style, { circle: true, glue: false }), golden(`${style}-circle.ass`))
	})

	test(`${style} lights one word per event`, () => {
		const evs = events(buildAss(words, [1080, 1920], style))

		assert.equal(evs.length, words.length)

		for (const { text } of evs) {
			assert.equal(text.split(HIGHLIGHT).length - 1, 1)

			if (style === 'single') {
				assert.equal(
					visible(text)
						.split(/\s+/)
						.filter((t) => normalize(t)).length,
					1,
				)
			}
		}
	})

	test(`${style} events don't overlap`, () => {
		const evs = events(buildAss(words, [1080, 1920], style))

		evs.slice(1).forEach((next, i) => assert.ok(evs[i].start <= evs[i].end && evs[i].end <= next.start + 1e-9))
	})

	test(`${style} in a circle keeps off the corners`, () => {
		const ass = buildAss(words, [400, 400], style, { circle: true })
		const p = forCircle(presets[style])

		for (const line of ass.split('\n').filter((l) => l.startsWith('Style: '))) {
			const [marginL, marginR, marginV] = line.split(',').slice(-4, -1).map(Number)

			// 400 * CIRCLE_SIDE и 400 * CIRCLE_MARGIN из render.ts.
			assert.equal(marginL, 48)
			assert.equal(marginR, 48)

			if (p.alignment === 2) assert.ok(marginV >= 80)
		}

		for (const { text } of events(ass)) {
			const shown = visible(text).split(/\s+/).join(' ')

			assert.ok(shown.length <= p.maxChars || !shown.includes(' '), shown)

			// Сжатие стоит в начале строки, после включения подсветки и после её сброса.
			if (shown.length > p.maxChars) assert.equal(text.split(String.raw`\fscx`).length - 1, 3)
		}
	})
}

test('override braces in the text are defused', () => {
	assert.equal(
		buildAss([{ text: String.raw`{\b1}hi`, start: 0, end: 1, line_end: false }], [100, 100], 'classic'),
		golden('escape.ass'),
	)
})

test('a long word is squeezed only in a circle', () => {
	const word: Word[] = [{ text: 'высокопревосходительство', start: 0, end: 1, line_end: false }]

	assert.equal(buildAss(word, [400, 400], 'single', { circle: true }), golden('long-circle.ass'))
	assert.ok(!buildAss(word, [400, 400], 'single').includes(String.raw`\fscx`))
})

test('circle pages are shorter', () => {
	for (const style of STYLES) assert.ok(forCircle(presets[style]).maxChars <= presets[style].maxChars)

	assert.ok(forCircle(presets.big).maxChars < presets.big.maxChars)
	assert.ok(forCircle(presets.single).font < presets.single.font)
})

test('a short word holds on to the next one with a hard space', () => {
	const page: Word[] = ['ездили', 'в', 'Самару'].map((text, i) => ({ text, start: i, end: i + 0.5, line_end: false }))
	const [first] = events(buildAss(page, [1080, 1920], 'classic'))

	assert.ok(first.text.endsWith(String.raw`ЕЗДИЛИ{\r} В\hСАМАРУ`), first.text)
})

for (const style of STYLES) {
	test(`libass renders a frame in ${style}`, async (t) => {
		if (!(await hasFilter('ass'))) return t.skip('ffmpeg without libass (set SUBLYA_FFMPEG)')

		const dir = mkdtempSync(join(tmpdir(), 'sublya-'))
		const video = join(dir, 'in.mp4')

		await run(
			tool('ffmpeg'),
			'-v',
			'error',
			'-f',
			'lavfi',
			'-i',
			'color=c=gray:s=270x480:d=20:r=5',
			'-f',
			'lavfi',
			'-i',
			'anullsrc=r=16000:cl=mono',
			'-t',
			'20',
			'-shortest',
			'-c:v',
			'libx264',
			'-c:a',
			'aac',
			video,
		)

		const ass = join(dir, 'subs.ass')
		const { writeFile } = await import('node:fs/promises')

		await writeFile(ass, buildAss(words, [270, 480], style))
		const out = join(dir, 'out.mp4')

		await burn(video, ass, out, ['-ss', '14', '-frames:v', '1'])
		assert.ok((await stat(out)).size > 0)
	})
}
