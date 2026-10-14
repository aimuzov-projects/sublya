// ASS subtitles with one event per word, and burning them into the video.

import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { run, tool } from '#bot/core/ffmpeg.ts'
import {
	chars,
	DEFAULT_STYLE,
	glued,
	paginate,
	presets,
	TAIL,
	type Preset,
	type Style,
	type Word,
} from '#shared/subtitles.ts'

const FONT = 'Montserrat ExtraBold'

export const HIGHLIGHT = String.raw`{\rHi}` // switches to the Hi style; {\r} switches back

// ASS colours are &HAABBGGRR
const WHITE = '&H00FFFFFF'
const BLACK = '&H00000000'
const YELLOW = '&H0000FFFF'
const PINK = '&H00552CFE'
const SHADOW = '&H80000000'

const CIRCLE_MARGIN = 0.2 // the circle's chord 0.3h below the centre is still 0.8w wide
const CIRCLE_SIDE = 0.12
const CAPS_WIDTH = 0.7 // average width of an upper-case Montserrat ExtraBold letter, in font sizes

/** Python's round(): halves go to the even neighbour. The ASS of the Python bot is the reference. */
export function round(x: number): number {
	const r = Math.round(x)

	return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r
}

/** A video note is shown cropped to its inscribed circle, so the corners are gone: bottom
 * lines move up to where the circle is still wide, and pages get fewer letters. */
export function forCircle(p: Preset): Preset {
	const font = Math.min(p.font, 0.09)
	const fits = Math.trunc((1 - 2 * CIRCLE_SIDE) / (CAPS_WIDTH * font))
	const margin = p.alignment === 2 ? Math.max(p.margin, CIRCLE_MARGIN) : p.margin

	return { ...p, font, margin, side: CIRCLE_SIDE, maxChars: Math.min(p.maxChars, fits) }
}

export function assTime(t: number): string {
	const cs = round(t * 100)
	const two = (n: number) => String(n).padStart(2, '0')

	return `${Math.floor(cs / 360000)}:${two(Math.floor(cs / 6000) % 60)}:${two(Math.floor(cs / 100) % 60)}.${two(cs % 100)}`
}

export const assEscape = (text: string) => text.replaceAll('\\', '').replaceAll('{', '(').replaceAll('}', ')')

function styleLine(name: string, p: Preset, [w, h]: [number, number], colour: string, box: boolean): string {
	const fs = round(w * p.font)
	// BorderStyle 3 draws an opaque box in the outline colour; outline width is its padding
	const [border, outline, shadow, outlineColour] = box
		? [3, round(fs * 0.12), 0, PINK]
		: [1, round(fs * 0.08), round(fs * 0.05), BLACK]

	return (
		`Style: ${name},${FONT},${fs},${colour},${colour},${outlineColour},${SHADOW},-1,0,0,0,` +
		`100,100,0,0,${border},${outline},${shadow},${p.alignment},` +
		`${round(w * p.side)},${round(w * p.side)},${round(h * p.margin)},1`
	)
}

export type AssOptions = {
	circle?: boolean
	/** A short word and the next one share a line: `\h` is a space libass never breaks. */
	glue?: boolean
}

export function buildAss(
	words: Word[],
	size: [number, number],
	style: Style,
	{ circle = false, glue = true }: AssOptions = {},
): string {
	const p = circle ? forCircle(presets[style]) : presets[style]
	const [w, h] = size
	const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleLine('Word', p, size, WHITE, false)}
${styleLine('Hi', p, size, p.hi === 'yellow' ? YELLOW : WHITE, p.box)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
	const pages = paginate(words, p.perPage, p.maxChars)
	const lines: string[] = []

	pages.forEach((page, n) => {
		const nextPageStart = n + 1 < pages.length ? pages[n + 1][0].start : Infinity
		const texts = page.map((x) => assEscape(x.text.toUpperCase()))
		const spaces = page.slice(1).map((x, i) => (glue && glued(page[i].text, x.text) ? String.raw`\h` : ' '))
		// a word longer than a page can't wrap and would stick out of the circle, so it is
		// squeezed; \r drops the squeeze, hence it goes after every reset too
		const length = chars(texts.join(' '))
		const fit = circle && length > p.maxChars ? `{\\fscx${Math.floor((100 * p.maxChars) / length)}}` : ''

		page.forEach((word, i) => {
			// each word stays lit until the next one starts, so the page never blinks
			const end = i + 1 < page.length ? page[i + 1].start : Math.min(word.end + TAIL, nextPageStart)
			const body =
				fit +
				texts
					.map((t, j) => (j === i ? `${HIGHLIGHT}${fit}${t}{\\r}${fit}` : t))
					.map((t, j) => (j ? spaces[j - 1] + t : t))
					.join('')
			const pop = i === 0 ? String.raw`{\fad(80,0)}` : ''

			lines.push(`Dialogue: 0,${assTime(word.start)},${assTime(end)},Word,,0,0,0,,${pop}${body}`)
		})
	})

	return header + lines.join('\n') + '\n'
}

// the filter graph parser needs these characters escaped inside a quoted value
const filterArg = (path: string) =>
	`'${resolve(path).replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll(':', '\\:')}'`

export async function burn(video: string, ass: string, out: string, extra: string[] = []): Promise<void> {
	let vf = `ass=${filterArg(ass)}`
	const fonts = process.env.SUBLYA_FONTS_DIR

	if (fonts) vf += `:fontsdir=${filterArg(fonts)}`

	await run(
		tool('ffmpeg'),
		'-y',
		'-v',
		'error',
		'-i',
		video,
		'-vf',
		vf,
		'-c:v',
		'libx264',
		'-preset',
		'veryfast',
		'-crf',
		'20',
		'-pix_fmt',
		'yuv420p',
		'-c:a',
		'copy',
		'-movflags',
		'+faststart',
		...extra,
		out,
	)
}

export async function render(
	video: string,
	words: Word[],
	size: [number, number],
	workdir: string,
	style: Style = DEFAULT_STYLE,
	circle = false,
): Promise<string> {
	const ass = join(workdir, 'subs.ass')
	const out = join(workdir, `out-${style}.mp4`)

	await writeFile(ass, buildAss(words, size, style, { circle }), 'utf8')
	await burn(video, ass, out)

	return out
}
