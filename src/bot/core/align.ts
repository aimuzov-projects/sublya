// Тайминги слов: прилипание к паузам и подстановка эталонного текста. Экраны режутся
// в `src/shared/subtitles.ts`, одинаково для бота и для сайта.

import type { Transcript } from '#bot/core/models.ts'
import { SequenceMatcher } from '#bot/core/sequence-matcher.ts'
import { chars, type Word } from '#shared/subtitles.ts'

type Pause = [number, number]

/**
 * Насколько поздно каждый вид таймингов ставит начало слова, в секундах.
 * Отрицательное значение значит, что рано.
 */
export const DEFAULT_LAG = { mark: 0.15, span: -0.2 }
const SPAN_LEAD = 0.2 // пауза, начавшаяся так скоро после начала спана, ещё стоит перед словом
const SPAN_TRAIL = 0.3 // ...и может закончиться настолько позже конца спана

/**
 * DTW ставит метку слова чуть позже, чем оно начинает звучать. Пауза, которая
 * заканчивается между метками двух слов, и есть то место, где начинается второе.
 */
function snapMarks(words: Word[], pauses: Pause[], lag: number) {
	let prev = 0

	for (const w of words) {
		const resumed = pauses.filter(([, e]) => prev < e && e <= w.start).map(([, e]) => e)

		prev = w.start
		w.start = resumed.length ? resumed.at(-1)! : Math.max(w.start - lag, 0)
	}
}

/**
 * Спаны Whisper начинаются рано и проглатывают паузу перед словом. Если пауза накрывает
 * начало спана и заканчивается внутри него, то слово на самом деле начинается там.
 */
function snapSpans(words: Word[], pauses: Pause[], lag: number) {
	for (const w of words) {
		const inside = pauses
			.filter(([s, e]) => s < w.start + SPAN_LEAD && w.start < e && e < w.end + SPAN_TRAIL)
			.map(([, e]) => e)

		w.start = inside.length ? inside.at(-1)! : Math.max(w.start - lag, 0)
	}
}

/**
 * Подтягивает начала слов к концам пауз и заново считает концы.
 *
 * Слово заканчивается там, где начинается следующее, или раньше, если между ними пауза.
 * Последнее слово держится не дольше двух секунд и не дальше конца видео.
 * Входные слова не меняются, возвращается копия.
 *
 * @param lag Поправка, которая вычитается из начала слова, если подходящей паузы нет;
 * по умолчанию берётся из {@link DEFAULT_LAG} для `timing`.
 * @param timing Вид таймингов распознавания, см. `Transcript.timing`.
 */
export function snap(
	words: Word[],
	pauses: Pause[],
	duration: number,
	lag: number | null = null,
	timing: 'mark' | 'span' = 'mark',
): Word[] {
	const out = words.map((w) => ({ ...w }))

	;(timing === 'mark' ? snapMarks : snapSpans)(out, pauses, lag ?? DEFAULT_LAG[timing])

	// После сдвигов слово может оказаться раньше предыдущего, поэтому выравниваем начала по порядку.
	for (let i = 1; i < out.length; i++) out[i].start = Math.max(out[i].start, out[i - 1].start)

	out.forEach((w, i) => {
		const next = i + 1 < out.length ? out[i + 1].start : Math.min(w.start + 2, duration)
		const paused = pauses.filter(([s]) => w.start < s && s < next)

		w.end = paused.length ? paused[0][0] : next
	})

	return out
}

/**
 * Приводит слово к виду для сравнения: нижний регистр, `ё` превращается в `е`.
 * Остаются только символы Python-овского `\w`: буквы, цифры и подчёркивание.
 */
export const normalize = (text: string) =>
	text
		.toLowerCase()
		.replaceAll('ё', 'е')
		.replace(/[^\p{L}\p{N}_]/gu, '')

// Переносы строк Python-овского `str.splitlines()`, в том числе разделители файлов и групп.
// oxlint-disable-next-line no-control-regex
const LINES = /\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/

/**
 * Разбивает эталонный текст на слова без таймингов.
 * Последнее слово каждой строки помечается `line_end`, по нему потом ломаются экраны.
 */
export function readText(text: string): Word[] {
	const words: Word[] = []

	for (const line of text.split(LINES)) {
		for (const tok of line.split(/\s+/).filter(Boolean)) {
			// Одинокое тире (как и любой токен без букв и цифр) относится к предыдущему слову.
			if (words.length && !normalize(tok)) words.at(-1)!.text += ` ${tok}`
			else words.push({ text: tok, start: 0, end: 0, line_end: false })
		}

		if (words.length) words.at(-1)!.line_end = true
	}

	return words
}

/**
 * Берёт тайминги у услышанного, а написание у эталона. Несовпавшие куски делят
 * свой отрезок времени пропорционально длине слов.
 */
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
			// Если на слово выходит меньше 0.1 с, считаем, что между ними ничего не услышано,
			// и забираем хвост (вторую половину) предыдущего слова.
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

/**
 * Тайминги слов для рендера: прилипание к паузам, а если передан эталонный текст,
 * то ещё и его написание поверх распознанного.
 *
 * @param lag См. {@link snap}.
 */
export function align(transcript: Transcript, text: string | null = null, lag: number | null = null): Word[] {
	const words = snap(transcript.words, transcript.silences, transcript.duration, lag, transcript.timing)
	const ref = text ? readText(text) : []

	return ref.length ? applyText(words, ref) : words
}
