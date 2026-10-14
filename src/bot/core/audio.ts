import { run, tool } from '#bot/core/ffmpeg.ts'

const SILENCE = 'silencedetect=n=-35dB:d=0.25'

/** Размер кадра, на который лягут субтитры, с учётом поворота из метаданных. */
export async function videoSize(video: string): Promise<[number, number]> {
	const { stdout } = await run(
		tool('ffprobe'),
		'-v',
		'error',
		'-select_streams',
		'v:0',
		'-show_entries',
		'stream=width,height:stream_side_data=rotation',
		'-of',
		'json',
		video,
	)
	const info = JSON.parse(stdout).streams[0]
	const rotation = info.side_data_list?.[0]?.rotation ?? 0

	// ffmpeg сам поворачивает кадр при декодировании, поэтому у кадра с субтитрами
	// ширина и высота меняются местами.
	return Math.abs(rotation) % 180 === 90 ? [info.height, info.width] : [info.width, info.height]
}

/** Длительность в секундах. Бросает ошибку, если ffprobe её не отдал. */
export async function duration(media: string): Promise<number> {
	const { stdout } = await run(
		tool('ffprobe'),
		'-v',
		'error',
		'-show_entries',
		'format=duration',
		'-of',
		'csv=p=0',
		media,
	)
	// Контейнер без длительности в заголовке отдаёт N/A,
	// а NaN прошёл бы через любую проверку лимита.
	const seconds = Number.parseFloat(stdout)

	if (!Number.isFinite(seconds)) throw new Error(`ffprobe gave no duration for ${media}: ${stdout.trim()}`)

	return seconds
}

/** Вытаскивает звук в моно WAV 16 кГц. */
export async function extractAudio(video: string, audio: string): Promise<void> {
	await run(
		tool('ffmpeg'),
		'-y',
		'-v',
		'error',
		'-i',
		video,
		'-vn',
		'-ac',
		'1',
		'-ar',
		'16000',
		'-c:a',
		'pcm_s16le',
		audio,
	)
}

/**
 * Паузы в звуке как пары `[начало, конец]` в секундах.
 * Начало паузы, у которого нет конца, отбрасывается.
 */
export async function silences(audio: string): Promise<[number, number][]> {
	const { stderr } = await run(tool('ffmpeg'), '-v', 'info', '-i', audio, '-af', SILENCE, '-f', 'null', '-')
	const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]))
	const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]))

	return starts.slice(0, ends.length).map((s, i) => [s, ends[i]])
}
