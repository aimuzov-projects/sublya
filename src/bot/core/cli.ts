// Вжигает в видео субтитры в стиле TikTok с подсветкой произносимого слова.
//
// Распознанный текст кешируется в `work/<video>/transcript.json`, поэтому перезапуск
// с другим `--text` или `--style` обходится без распознавания.
//
// Запуск:
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
		// Эталонный текст, его переносы строк становятся разрывами экранов.
		text: { type: 'string' },
		style: { type: 'string', default: DEFAULT_STYLE },
		// Держать субтитры внутри круга, по которому Telegram обрезает видеосообщение.
		circle: { type: 'boolean', default: false },
		// Язык речи или auto.
		// Пустой `DEFAULT_LANG` означает автоопределение, как в боте.
		lang: { type: 'string', default: (process.env.DEFAULT_LANG ?? 'ru') || 'auto' },
		// Насколько поздно распознавание ставит начала слов, в секундах.
		// По умолчанию зависит от вида таймингов.
		lag: { type: 'string', default: process.env.STT_LAG || undefined },
		// Не брать закешированный транскрипт.
		retranscribe: { type: 'boolean', default: false },
		// Записать сюда выровненные слова в JSON вместо рендера, сайт рисует их сам.
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
