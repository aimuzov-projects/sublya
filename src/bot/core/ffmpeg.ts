import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { basename, delimiter, join } from 'node:path'

const STDERR_TAIL = 2000

export class FFmpegError extends Error {
	readonly stderr: string

	constructor(cmd: string[], stderr: string) {
		const tail = stderr.slice(-STDERR_TAIL)

		super(`${basename(cmd[0])} failed: ${tail.trim().slice(-300)}`)
		this.stderr = tail
	}
}

function which(name: string): string | null {
	for (const dir of (process.env.PATH ?? '').split(delimiter)) {
		const path = join(dir, name)

		try {
			accessSync(path, constants.X_OK)

			return path
		} catch {}
	}

	return null
}

/** SUBLYA_FFMPEG/SUBLYA_FFPROBE win over PATH: Homebrew's ffmpeg lacks libass. */
export function tool(name: 'ffmpeg' | 'ffprobe'): string {
	const path = process.env[`SUBLYA_${name.toUpperCase()}`] || which(name)

	if (!path) throw new Error(`${name} not found, set SUBLYA_${name.toUpperCase()}`)

	return path
}

export function run(...cmd: string[]): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		execFile(cmd[0], cmd.slice(1), { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (error) reject(new FFmpegError(cmd, stderr || error.message))
			else resolve({ stdout, stderr })
		})
	})
}

export async function hasFilter(name: string): Promise<boolean> {
	try {
		const { stdout } = await run(tool('ffmpeg'), '-hide_banner', '-filters')

		return stdout.split('\n').some((line) => line.trim().split(/\s+/)[1] === name)
	} catch {
		return false
	}
}
