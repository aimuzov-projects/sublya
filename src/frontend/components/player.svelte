<script lang="ts">
	// Two stacked videos: the next version loads and seeks behind the one on screen and takes
	// its place only once it plays, so switching keeps the moment and never flashes black.

	const once = (el: HTMLElement, event: string, ms = 3000) =>
		new Promise<void>((resolve) => {
			el.addEventListener(event, () => resolve(), { once: true })
			setTimeout(resolve, ms) // a stalled network shouldn't freeze the switch forever
		})

	let root: HTMLDivElement
	const videos: HTMLVideoElement[] = []
	let front = $state(0)
	let loading = $state(false)
	let switching = $state(false)
	let muted = $state(true)
	let active = false
	let seq = 0

	export const element = () => root

	// until the card's own video is up, the time on screen belongs to the previous one
	export const keepsTime = () => !loading

	// a new card shows its poster until its video can play
	export async function open(src: string) {
		loading = true
		return show(src, false)
	}

	export async function show(src: string, keepTime: boolean) {
		const current = ++seq
		switching = true
		const cur = videos[front]
		const index = 1 - front
		const next = videos[index]
		next.muted = cur.muted
		next.src = src
		await once(next, 'loadedmetadata')
		if (current !== seq) return false
		// seeking takes a moment, so aim a bit ahead of where the playing video will be by then
		const ahead = keepTime && !cur.paused ? 0.12 : 0
		next.currentTime = keepTime ? Math.min(cur.currentTime + ahead, next.duration - 0.1) : 0
		await once(next, 'seeked')
		if (current !== seq) return false
		if (active) await next.play().catch(() => {})
		if (current !== seq) return false
		front = index
		cur.pause()
		// whoever wins shows the video: a style picked while a card loads cancels its open
		loading = switching = false
		return true
	}

	export function play() {
		active = true
		videos[front].play().catch(() => {})
	}

	export function pause() {
		active = false
		for (const v of videos) v.pause()
	}

	function toggleSound() {
		muted = !muted
		for (const v of videos) v.muted = muted
		if (!muted) play()
	}
</script>

<div class="player" class:loading class:switching bind:this={root}>
	{#each [0, 1] as i (i)}
		<video bind:this={videos[i]} class:front={front === i} muted loop playsinline preload="auto"></video>
	{/each}
	<button
		class="sound"
		type="button"
		data-muted={String(muted)}
		aria-label={muted ? 'Включить звук' : 'Выключить звук'}
		onclick={toggleSound}
	>
		<svg class="i-muted" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M11 5 6 9H2v6h4l5 4V5z"></path>
			<path d="m23 9-6 6M17 9l6 6"></path>
		</svg>
		<svg class="i-sound" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M11 5 6 9H2v6h4l5 4V5z"></path>
			<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"></path>
		</svg>
	</button>
</div>
