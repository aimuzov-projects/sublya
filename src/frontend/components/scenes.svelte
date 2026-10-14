<script lang="ts">
	import { flushSync, onMount } from 'svelte'

	type Props = {
		/** Подпись, которую набирает вторая сцена. */
		caption: string
	}

	const { caption }: Props = $props()

	const words = ['вкусным', 'обедом.']

	// Сцены играют, только пока видны на экране: первая -- чистый CSS, вторая набирает
	// подпись, третья подсвечивает субтитры по слову.
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
			// Лишний шаг (`words.length`) -- пауза, когда не подсвечено ни одно слово.
			lit = i++ % (words.length + 1)
			timers[2] = setTimeout(step, 650)
		}

		step()
	}

	// Останавливает сцену, а если попросили -- запускает её с начала.
	function run(n: number, on: boolean) {
		running[n] = false
		clearTimeout(timers[n])

		if (!on) return

		// Чтобы CSS-анимации перезапустились, класс должен уйти из DOM и вернуться:
		// `flushSync` снимает его сразу, а чтение `offsetWidth` форсирует reflow.
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

<ol class="steps__list">
	<li class="steps__item" onpointerenter={(e) => hover(0, e)}>
		<div class="scene scene-send" class:running={running[0]} aria-hidden="true" bind:this={scenes[0]}>
			<div class="chat-bubble">
				<div class="clip">
					<span class="play"></span>
				</div>
				<div class="upload">
					<i class="upload__bar"></i>
				</div>
				<svg class="check" viewBox="0 0 24 24" aria-hidden="true">
					<path d="m5 12 5 5 9-10"></path>
				</svg>
			</div>
		</div>
		<b class="steps__name">Пришли видео</b>Обычным сообщением, файлом или кружком.
	</li>
	<li class="steps__item" onpointerenter={(e) => hover(1, e)}>
		<div class="scene scene-type" class:running={running[1]} aria-hidden="true" bind:this={scenes[1]}>
			<div class="field">
				<span class="label">Подпись</span>
				<p class="field__text">
					<span class="typed">{typed}</span>
					<span class="caret"></span>
				</p>
			</div>
		</div>
		<b class="steps__name">Добавь текст в подпись</b>Если он есть: стих, сценарий, песня. На экране будут твои
		слова, а тайминги бот возьмёт из речи. Переносы строк станут сменой экрана.
	</li>
	<li class="steps__item" onpointerenter={(e) => hover(2, e)}>
		<div class="scene scene-result" class:running={running[2]} aria-hidden="true" bind:this={scenes[2]}>
			<div class="frame">
				<p class="subs">
					{#each words as word, i (i)}
						{#if i}{' '}{/if}<span class:lit={lit === i}>{word}</span>
					{/each}
				</p>
			</div>
			<div class="kb">
				<span class="kb__button">✏️ Текст</span>
				<span class="kb__button">🎨 Стиль</span>
			</div>
		</div>
		<b class="steps__name">Забери ролик</b>Если бот ослышался, нажми «✏️ Текст» и пришли правильный. Видео
		пересоберётся за секунды.
	</li>
</ol>
