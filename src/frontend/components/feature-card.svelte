<script lang="ts">
	import type { Snippet } from 'svelte'

	type Props = {
		title: string
		text: string
		icon: string[]
		dotted?: string
		children?: Snippet
	}

	const { title, text, icon, dotted, children }: Props = $props()

	// A card under the cursor plays its text like the bot's subtitles: one word lit at a time,
	// longer words longer, then a breath and again from the top.
	// spaces stay text, every word gets its number
	const parts = $derived.by(() => {
		let count = 0

		return text.split(/(\s+)/).map((part) => ({ part, n: part.trim() ? count++ : -1 }))
	})
	const words = $derived(parts.filter(({ n }) => n >= 0).map(({ part }) => part))
	let lit = $state(-1)
	let timer: ReturnType<typeof setTimeout> | undefined

	function stop() {
		clearTimeout(timer)
		lit = -1
	}

	function play(i = 0) {
		lit = i

		if (i === words.length) timer = setTimeout(play, 700)
		else timer = setTimeout(() => play(i + 1), 110 + words[i].length * 38)
	}

	function start() {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

		stop()
		play()
	}
</script>

<article class="cards__item" onpointerenter={start} onpointerleave={stop}>
	<span class="badge">
		<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
			{#each icon as d (d)}
				<path {d} />
			{/each}
			{#if dotted}
				<path d={dotted} stroke-dasharray="1 3" />
			{/if}
		</svg>
	</span>
	<h3>{title}</h3>
	<p class="cards__text">
		{#each parts as { part, n }, i (i)}
			{#if n >= 0}
				<span class="w" class:lit={lit === n}>{part}</span>
			{:else}
				{part}
			{/if}
		{/each}
	</p>
	{@render children?.()}
</article>
