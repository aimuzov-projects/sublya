<script lang="ts">
	import { at, type Screen } from '#frontend/lib/subtitles.ts'
	import type { Preset } from '#shared/subtitles.ts'

	type Props = {
		/** The screens of the current demo in the chosen style; none shows the video as sent. */
		screens: Screen[] | null
		preset: Preset
	}

	const { screens, preset }: Props = $props()

	const once = (el: HTMLElement, event: string, ms = 3000) =>
		new Promise<void>((resolve) => {
			el.addEventListener(event, () => resolve(), { once: true })
			setTimeout(resolve, ms) // a stalled network shouldn't freeze the switch forever
		})

	let root: HTMLDivElement
	let video: HTMLVideoElement
	let loading = $state(false)
	let muted = $state(true)
	let time = $state(0)
	let active = false
	let seq = 0

	const shown = $derived(screens && !loading ? at(screens, time) : null)

	export const element = () => root

	// a new card shows its poster until its video can play
	export async function open(src: string) {
		const current = ++seq

		loading = true
		video.src = src
		await once(video, 'loadeddata')

		if (current !== seq) return

		if (active) await video.play().catch(() => {})

		if (current !== seq) return

		loading = false
	}

	export function play() {
		active = true
		video.play().catch(() => {})
	}

	export function pause() {
		active = false
		video.pause()
	}

	// the subtitles follow the frames on screen, not the coarse timeupdate events
	function follow() {
		time = video.currentTime

		if (video.paused) return

		if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(follow)
		else requestAnimationFrame(follow)
	}

	function toggleSound() {
		muted = !muted
		video.muted = muted

		if (!muted) play()
	}
</script>

<div class="player" class:loading bind:this={root}>
	<video
		class="player__video"
		bind:this={video}
		muted
		loop
		playsinline
		preload="auto"
		onplay={follow}
		onseeked={follow}
	></video>
	<div
		class="overlay"
		class:overlay--middle={preset.alignment === 5}
		class:overlay--box={preset.box}
		style:--font={preset.font}
		style:--margin={preset.margin}
		style:--side={preset.side}
		style:--hi={preset.hi === 'yellow' ? '#ffff00' : '#ffffff'}
		aria-hidden="true"
	>
		{#if shown}
			{#key shown.screen}
				<p class="overlay__line">
					{#each shown.screen.words as word, i (i)}
						{#if i}{shown.screen.glue[i - 1] ? '\u00a0' : ' '}{/if}<span
							class="overlay__word"
							class:overlay__word--lit={i === shown.lit}>{word}</span
						>
					{/each}
				</p>
			{/key}
		{/if}
	</div>
	<button
		class="sound"
		type="button"
		data-muted={String(muted)}
		aria-label={muted ? 'Включить звук' : 'Выключить звук'}
		onclick={toggleSound}
	>
		<svg class="sound__icon i-muted" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M11 5 6 9H2v6h4l5 4V5z"></path>
			<path d="m23 9-6 6M17 9l6 6"></path>
		</svg>
		<svg class="sound__icon i-sound" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M11 5 6 9H2v6h4l5 4V5z"></path>
			<path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"></path>
		</svg>
	</button>
</div>
