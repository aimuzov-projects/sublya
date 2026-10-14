<script lang="ts">
	import { onMount } from 'svelte'

	type Props = { href: string; label: string }

	const { href, label }: Props = $props()

	// The last button teases a mouse: it dodges left, right and left again, and on the fourth try
	// comes back to the middle and gives in. Touch screens and keyboards get a plain button.
	// where each dodge goes: -1 left, 1 right
	const dodges = [
		{ side: -1, text: 'Мимо!' },
		{ side: 1, text: 'Ещё разок' },
		{ side: -1, text: 'Почти!' },
	]

	let button: HTMLAnchorElement
	let enabled = false
	let tries = $state(0)
	let transform = $state('')
	// brings the button back if the cursor doesn't chase it
	let homing: ReturnType<typeof setTimeout> | undefined
	const text = $derived(tries > 0 && tries <= dodges.length ? dodges[tries - 1].text : label)

	onMount(() => {
		const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

		enabled = fine && !reduced

		return () => clearTimeout(homing)
	})

	function dodge(e: PointerEvent) {
		if (!enabled || e.pointerType !== 'mouse' || tries > dodges.length) return

		clearTimeout(homing)

		if (tries++ === dodges.length) {
			transform = ''

			return
		}

		const { side } = dodges[tries - 1]

		// as far as the section allows, so it stays in sight
		const room = button.parentElement!.clientWidth / 2 - button.offsetWidth / 2 - 16
		const x = side * Math.min(room, 320) * (0.75 + Math.random() * 0.25)
		// on a narrow screen the side step is short, so it also hops down off the cursor
		const y = Math.abs(x) < button.offsetWidth ? 70 : (Math.random() - 0.5) * 60

		transform = `translate(${x | 0}px, ${y | 0}px) rotate(${side * 5}deg)`
		// only the position goes back, the teasing carries on from where it stopped
		homing = setTimeout(() => (transform = ''), 3000)
	}
</script>

<a
	class="btn"
	class:caught={tries > dodges.length}
	{href}
	style:transform={transform || undefined}
	bind:this={button}
	onpointerenter={dodge}>{text}</a
>
