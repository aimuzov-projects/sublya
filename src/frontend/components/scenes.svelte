<script lang="ts">
	import { flushSync, onMount } from 'svelte'

	type Props = {
		/** The caption the second scene types out. */
		caption: string
	}

	const { caption }: Props = $props()

	const words = ['вкусным', 'обедом.']

	// The scenes play only while on screen: the first is pure CSS, the second types its
	// caption, the third lights its subtitles word by word.
	let running = $state([false, false, false])
	let typed = $state('')
	let lit = $state(-1)
	const scenes: HTMLElement[] = []
	const timers: ReturnType<typeof setTimeout>[] = []

	function typing() {
		let i = 0
		const step = () => {
			typed = caption.slice(0, i)
			if (i++ < caption.length) timers[1] = setTimeout(step, 55 + Math.random() * 60)
			else
				timers[1] = setTimeout(() => {
					i = 0
					step()
				}, 1800)
		}
		step()
	}

	function lighting() {
		let i = 0
		const step = () => {
			lit = i++ % (words.length + 1)
			timers[2] = setTimeout(step, 650)
		}
		step()
	}

	// stops a scene, and starts it from the beginning when asked to
	function run(n: number, on: boolean) {
		running[n] = false
		clearTimeout(timers[n])
		if (!on) return
		// the class has to leave the DOM and come back for the CSS animations to restart
		flushSync()
		void scenes[n].offsetWidth
		running[n] = true
		if (n === 1) typing()
		if (n === 2) lighting()
	}

	function hover(n: number, e: PointerEvent) {
		if (e.pointerType === 'mouse') run(n, true)
	}

	onMount(() => {
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			typed = caption
			return
		}
		const io = new IntersectionObserver(
			(entries) => {
				for (const { target, isIntersecting } of entries)
					run(scenes.indexOf(target as HTMLElement), isIntersecting)
			},
			{ threshold: 0.3 },
		)
		for (const scene of scenes) io.observe(scene)
		return () => {
			io.disconnect()
			for (const t of timers) clearTimeout(t)
		}
	})
</script>

<ol>
	<li onpointerenter={(e) => hover(0, e)}>
		<div class="scene scene-send" class:running={running[0]} aria-hidden="true" bind:this={scenes[0]}>
			<div class="chat-bubble">
				<div class="clip">
					<span class="play"></span>
				</div>
				<div class="upload">
					<i></i>
				</div>
				<svg class="check" viewBox="0 0 24 24" aria-hidden="true">
					<path d="m5 12 5 5 9-10"></path>
				</svg>
			</div>
		</div>
		<b>Пришли видео</b>Обычным сообщением, файлом или кружком.
	</li>
	<li onpointerenter={(e) => hover(1, e)}>
		<div class="scene scene-type" class:running={running[1]} aria-hidden="true" bind:this={scenes[1]}>
			<div class="field">
				<span class="label">Подпись</span>
				<p>
					<span class="typed">{typed}</span>
					<span class="caret"></span>
				</p>
			</div>
		</div>
		<b>Добавь текст в подпись</b>Если он есть: стих, сценарий, песня. На экране будут твои слова, а тайминги бот
		возьмёт из речи. Переносы строк станут сменой экрана.
	</li>
	<li onpointerenter={(e) => hover(2, e)}>
		<div class="scene scene-result" class:running={running[2]} aria-hidden="true" bind:this={scenes[2]}>
			<div class="frame">
				<p class="subs">
					{#each words as word, i (i)}
						{#if i}{' '}{/if}<span class:lit={lit === i}>{word}</span>
					{/each}
				</p>
			</div>
			<div class="kb">
				<span>Исправить текст</span>
				<span>Стиль</span>
			</div>
		</div>
		<b>Забери ролик</b>Если бот ослышался, нажми «Исправить текст» и пришли правильный. Видео пересоберётся за
		секунды.
	</li>
</ol>
