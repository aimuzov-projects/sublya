import { copyFile, rename, unlink } from 'node:fs/promises'

/**
 * Перемещает файл, а если он на другом томе, то копирует.
 * Файлы Bot API лежат как раз на своём томе.
 */
export async function move(from: string, to: string) {
	try {
		await rename(from, to)
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e

		await copyFile(from, to)
		await unlink(from)
	}
}
