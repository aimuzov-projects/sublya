<script lang="ts">
	import { onMount } from 'svelte'

	type Props = { href: string; label: string }

	const { href, label }: Props = $props()

	// Последняя кнопка дразнит мышь: уворачивается влево, вправо и снова влево,
	// а на четвёртой попытке возвращается в середину и сдаётся.
	// На тач-экранах и с клавиатуры это обычная кнопка.
	//
	// Куда уходит каждый уворот: -1 влево, 1 вправо.
	const dodges = [
		{ side: -1, text: 'Мимо!' },
		{ side: 1, text: 'Ещё разок' },
		{ side: -1, text: 'Почти!' },
	]

	let button: HTMLAnchorElement
	let enabled = false
	let tries = $state(0)
	let transform = $state('')
	// Возвращает кнопку на место, если курсор за ней не гонится.
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

		// Так далеко, как позволяет секция, чтобы кнопка оставалась на виду.
		const room = button.parentElement!.clientWidth / 2 - button.offsetWidth / 2 - 16
		const x = side * Math.min(room, 320) * (0.75 + Math.random() * 0.25)
		// На узком экране шаг вбок короткий, поэтому кнопка ещё и прыгает вниз из-под курсора.
		const y = Math.abs(x) < button.offsetWidth ? 70 : (Math.random() - 0.5) * 60

		transform = `translate(${x | 0}px, ${y | 0}px) rotate(${side * 5}deg)`
		// Возвращается только позиция, а дразнилка продолжается с того места, где остановилась.
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
