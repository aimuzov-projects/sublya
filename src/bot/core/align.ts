// Word timings: snapping to pauses, swapping in a reference text. Screens are cut in
// src/shared/subtitles.ts, the same for the bot and the site.

import type { Transcript } from '#bot/core/models.ts'
import { SequenceMatcher } from '#bot/core/sequence-matcher.ts'
import { chars, type Word } from '#shared/subtitles.ts'

type Pause = [number, number]

// how late each kind of timing places a word; negative means early
export const DEFAULT_LAG = { mark: 0.15, span: -0.2 }
const SPAN_LEAD = 0.2 // a pause starting this soon after a span's start still precedes the word
const SPAN_TRAIL = 0.3 // ...and may end this far past the span's end

/** DTW marks a word a bit after it starts sounding. A pause that ends between two words'
 * marks is exactly where the later word begins. */
function snapMarks(words: Word[], pauses: Pause[], lag: number) {
	let prev = 0
	for (const w of words) {
		const resumed = pauses.filter(([, e]) => prev < e && e <= w.start).map(([, e]) => e)
		prev = w.start
		w.start = resumed.length ? resumed.at(-1)! : Math.max(w.start - lag, 0)
	}
}

/** Whisper spans start early and swallow the pause before the word. A pause that covers the
 * span's start and ends inside it is where the word really begins. */
function snapSpans(words: Word[], pauses: Pause[], lag: number) {
	for (const w of words) {
		const inside = pauses
			.filter(([s, e]) => s < w.start + SPAN_LEAD && w.start < e && e < w.end + SPAN_TRAIL)
			.map(([, e]) => e)
		w.start = inside.length ? inside.at(-1)! : Math.max(w.start - lag, 0)
	}
}

export function snap(
	words: Word[],
	pauses: Pause[],
	duration: number,
	lag: number | null = null,
	timing: 'mark' | 'span' = 'mark',
): Word[] {
	const out = words.map((w) => ({ ...w }))
	;(timing === 'mark' ? snapMarks : snapSpans)(out, pauses, lag ?? DEFAULT_LAG[timing])
	for (let i = 1; i < out.length; i++) out[i].start = Math.max(out[i].start, out[i - 1].start)
	out.forEach((w, i) => {
		const next = i + 1 < out.length ? out[i + 1].start : Math.min(w.start + 2, duration)
		const paused = pauses.filter(([s]) => w.start < s && s < next)
		w.end = paused.length ? paused[0][0] : next
	})
	return out
}

// Python's \w: letters, digits and the underscore
export const normalize = (text: string) =>
	text
		.toLowerCase()
		.replaceAll('ё', 'е')
		.replace(/[^\p{L}\p{N}_]/gu, '')

// the line breaks of Python's str.splitlines(), the file and group separators among them
// oxlint-disable-next-line no-control-regex
const LINES = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/

export function readText(text: string): Word[] {
	const words: Word[] = []
	for (const line of text.split(LINES)) {
		for (const tok of line.split(/\s+/).filter(Boolean)) {
			// a lone dash belongs to the previous word
			if (words.length && !normalize(tok)) words.at(-1)!.text += ` ${tok}`
			else words.push({ text: tok, start: 0, end: 0, line_end: false })
		}
		if (words.length) words.at(-1)!.line_end = true
	}
	return words
}

/** Keeps the timings of what was heard and the wording of the reference. Unmatched runs share
 * their time span in proportion to word length. */
export function applyText(heard: Word[], ref: Word[]): Word[] {
	const sm = new SequenceMatcher(
		heard.map((w) => normalize(w.text)),
		ref.map((w) => normalize(w.text)),
	)
	const out: Word[] = []
	for (const [op, i1, i2, j1, j2] of sm.opcodes()) {
		if (op === 'delete') continue
		if (op === 'equal') {
			for (let k = 0; k < i2 - i1; k++) {
				const [h, r] = [heard[i1 + k], ref[j1 + k]]
				out.push({ text: r.text, start: h.start, end: h.end, line_end: r.line_end })
			}
			continue
		}
		let start = i1 < i2 ? heard[i1].start : out.length ? out.at(-1)!.end : 0
		const end = i1 < i2 ? heard[i2 - 1].end : i2 < heard.length ? heard[i2].start : start
		if (end - start < 0.1 * (j2 - j1) && out.length) {
			// nothing heard in between: borrow the tail of the previous word
			const last = out.at(-1)!
			start = last.start + (last.end - last.start) / 2
			last.end = start
		}
		const total = ref.slice(j1, j2).reduce((n, r) => n + chars(r.text), 0)
		let t = start
		for (const r of ref.slice(j1, j2)) {
			const dur = ((end - start) * chars(r.text)) / total
			out.push({ text: r.text, start: t, end: t + dur, line_end: r.line_end })
			t += dur
		}
	}
	return out
}

export function align(transcript: Transcript, text: string | null = null, lag: number | null = null): Word[] {
	const words = snap(transcript.words, transcript.silences, transcript.duration, lag, transcript.timing)
	const ref = text ? readText(text) : []
	return ref.length ? applyText(words, ref) : words
}
