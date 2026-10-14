import { copyFile, rename, unlink } from 'node:fs/promises'

/** Moves a file, copying it when it sits on another volume: the Bot API files are on theirs. */
export async function move(from: string, to: string) {
	try {
		await rename(from, to)
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e

		await copyFile(from, to)
		await unlink(from)
	}
}
