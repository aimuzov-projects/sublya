import { run, tool } from '#bot/core/ffmpeg.ts'

const SILENCE = 'silencedetect=n=-35dB:d=0.25'

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

	// ffmpeg autorotates on decode, so the frame the subtitles land on is swapped
	return Math.abs(rotation) % 180 === 90 ? [info.height, info.width] : [info.width, info.height]
}

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
	// a container without a duration in its header gives N/A, and NaN would pass any limit
	const seconds = Number.parseFloat(stdout)

	if (!Number.isFinite(seconds)) throw new Error(`ffprobe gave no duration for ${media}: ${stdout.trim()}`)

	return seconds
}

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

export async function silences(audio: string): Promise<[number, number][]> {
	const { stderr } = await run(tool('ffmpeg'), '-v', 'info', '-i', audio, '-af', SILENCE, '-f', 'null', '-')
	const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]))
	const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]))

	return starts.slice(0, ends.length).map((s, i) => [s, ends[i]])
}
