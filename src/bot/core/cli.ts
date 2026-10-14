// Burns TikTok-style subtitles into a video, highlighting the word being spoken.
//
// The recognised transcript is cached in work/<video>/transcript.json, so reruns with a
// different --text or --style skip recognition.
//
// Usage:
//   node src/bot/core/cli.ts IMG_4476.MOV
//   node src/bot/core/cli.ts IMG_4476.MOV --text poem.txt --style big

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { align } from '#bot/core/align.ts'
import { move } from '#bot/core/files.ts'
import { fromJson, toJson } from '#bot/core/models.ts'
import { render } from '#bot/core/render.ts'
import { sttFromEnv, transcribe } from '#bot/core/transcribe.ts'
import { DEFAULT_STYLE, isStyle, STYLES } from '#shared/subtitles.ts'

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		output: { type: 'string', short: 'o' },
		// reference text; its line breaks become page breaks
		text: { type: 'string' },
		style: { type: 'string', default: DEFAULT_STYLE },
		// keep subtitles inside the circle a Telegram video note is cropped to
		circle: { type: 'boolean', default: false },
		// speech language, or auto
		// an empty DEFAULT_LANG means autodetect, as in the bot
		lang: { type: 'string', default: (process.env.DEFAULT_LANG ?? 'ru') || 'auto' },
		// how late the recogniser places word starts, seconds; by default depends on the timing kind
		lag: { type: 'string', default: process.env.STT_LAG || undefined },
		// ignore the cached transcript
		retranscribe: { type: 'boolean', default: false },
		// write the aligned words as JSON here instead of rendering; the site draws them itself
		words: { type: 'string' },
	},
})

const [input] = positionals
if (!input || !isStyle(values.style)) {
	console.error(`usage: cli.ts VIDEO [-o OUT] [--text FILE] [--style ${STYLES.join('|')}] [--circle] [--words FILE]`)
	process.exit(2)
}

const video = resolve(input)
const stem = basename(video, extname(video))
const out = values.output ?? join(dirname(video), `${stem}.subs.mp4`)
const work = join(dirname(video), 'work', stem)
await mkdir(work, { recursive: true })
const cached = join(work, 'transcript.json')

let transcript
if (values.retranscribe || !existsSync(cached)) {
	const cfg = sttFromEnv()
	if (!cfg.key) {
		console.error('set STT_API_KEY')
		process.exit(1)
	}
	transcript = await transcribe(video, work, cfg, values.lang === 'auto' ? null : values.lang)
	await writeFile(cached, toJson(transcript), 'utf8')
} else {
	transcript = fromJson(await readFile(cached, 'utf8'))
}

const text = values.text ? await readFile(values.text, 'utf8') : null
const words = align(transcript, text, values.lag ? Number(values.lag) : null)
await writeFile(
	join(work, 'words.tsv'),
	words.map((w) => `${w.start.toFixed(2)}\t${w.end.toFixed(2)}\t${w.text}\n`).join(''),
	'utf8',
)
console.error('text:', words.map((w) => w.text).join(' '))

if (values.words) {
	const round = (t: number) => Math.round(t * 1000) / 1000
	const data = words.map((w) => ({ ...w, start: round(w.start), end: round(w.end) }))
	await writeFile(values.words, JSON.stringify(data) + '\n', 'utf8')
	console.log(values.words)
} else {
	await move(await render(video, words, transcript.size, work, values.style, values.circle), out)
	console.log(out)
}
