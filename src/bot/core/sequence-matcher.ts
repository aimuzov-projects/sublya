// Python's difflib.SequenceMatcher with autojunk=False and no junk, line for line: the
// reference text is lined up with what was heard exactly as the Python bot did it.

export type Opcode = ['replace' | 'delete' | 'insert' | 'equal', number, number, number, number]
type Block = [number, number, number]

export class SequenceMatcher<T> {
	private readonly a: T[]
	private readonly b: T[]
	private readonly b2j = new Map<T, number[]>()

	constructor(a: T[], b: T[]) {
		this.a = a
		this.b = b

		b.forEach((elt, i) => {
			const list = this.b2j.get(elt)

			if (list) list.push(i)
			else this.b2j.set(elt, [i])
		})
	}

	findLongestMatch(alo: number, ahi: number, blo: number, bhi: number): Block {
		const { a, b } = this
		let [besti, bestj, bestsize] = [alo, blo, 0]
		let j2len = new Map<number, number>()

		for (let i = alo; i < ahi; i++) {
			const next = new Map<number, number>()

			for (const j of this.b2j.get(a[i]) ?? []) {
				if (j < blo) continue

				if (j >= bhi) break

				const k = (j2len.get(j - 1) ?? 0) + 1

				next.set(j, k)

				if (k > bestsize) [besti, bestj, bestsize] = [i - k + 1, j - k + 1, k]
			}

			j2len = next
		}

		while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
			;[besti, bestj, bestsize] = [besti - 1, bestj - 1, bestsize + 1]
		}

		while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
			bestsize++
		}

		return [besti, bestj, bestsize]
	}

	matchingBlocks(): Block[] {
		const [la, lb] = [this.a.length, this.b.length]
		const queue: [number, number, number, number][] = [[0, la, 0, lb]]
		const blocks: Block[] = []

		while (queue.length) {
			const [alo, ahi, blo, bhi] = queue.pop()!
			const x = this.findLongestMatch(alo, ahi, blo, bhi)
			const [i, j, k] = x

			if (k) {
				blocks.push(x)

				if (alo < i && blo < j) queue.push([alo, i, blo, j])

				if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi])
			}
		}

		blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])

		let [i1, j1, k1] = [0, 0, 0]
		const merged: Block[] = []

		for (const [i2, j2, k2] of blocks) {
			if (i1 + k1 === i2 && j1 + k1 === j2) k1 += k2
			else {
				if (k1) merged.push([i1, j1, k1])

				;[i1, j1, k1] = [i2, j2, k2]
			}
		}

		if (k1) merged.push([i1, j1, k1])

		merged.push([la, lb, 0])

		return merged
	}

	opcodes(): Opcode[] {
		let [i, j] = [0, 0]
		const answer: Opcode[] = []

		for (const [ai, bj, size] of this.matchingBlocks()) {
			const tag = i < ai && j < bj ? 'replace' : i < ai ? 'delete' : j < bj ? 'insert' : null

			if (tag) answer.push([tag, i, ai, j, bj])

			;[i, j] = [ai + size, bj + size]

			if (size) answer.push(['equal', ai, i, bj, j])
		}

		return answer
	}
}
