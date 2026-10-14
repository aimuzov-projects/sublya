<script lang="ts">
	import { onMount, untrack } from 'svelte'

	import Player from '#frontend/components/player.svelte'
	import { screens } from '#frontend/lib/subtitles.ts'
	import { isStyle, presets, type Word } from '#shared/subtitles.ts'

	type Demo = { id: string; note: string; v: string; duration: number; words: Word[] }
	type Style = { id: string; name: string; hint: string }
	type Props = {
		demos: Demo[]
		styles: Style[]
	}

	const { demos, styles }: Props = $props()

	const url = (demo: Demo, file: string, ext = 'mp4') => `/media/${demo.id}/${file}.${ext}?v=${demo.v}`

	function shuffle<T>(list: T[]) {
		const a = [...list]

		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1))

			;[a[i], a[j]] = [a[j], a[i]]
		}

		return a
	}

	const byId = $derived(new Map(demos.map((demo) => [demo.id, demo])))
	// Храним id, а не сами демки: `$state` оборачивает объекты в прокси,
	// и те никогда не равны оригиналам.
	// svelte-ignore state_referenced_locally
	let order = $state(demos.map((demo) => demo.id))
	// Карточки появляются только в браузере, так как сервер не знает перемешанный порядок.
	let mounted = $state(false)
	let seen = $state(0)
	let variant = $state<'before' | 'after'>('after')
	// svelte-ignore state_referenced_locally
	let style = $state(styles[0].id)
	let drag = $state<{ id: string; x: number; dx: number; pointer: number } | null>(null)
	let flight = $state<{ id: string; dir: number } | null>(null)
	let deck: HTMLDivElement
	// Через `$state`, чтобы карточки заметили плеер, если он появится после них.
	let player = $state<Player>()

	const top = $derived(byId.get(order[0])!)
	const several = $derived(demos.length > 1)
	const preset = $derived(presets[isStyle(style) ? style : 'classic'])
	// Субтитры верхней карточки в выбранном стиле или `null` для видео как его прислали.
	const subtitles = $derived(variant === 'after' ? screens(top.words, preset) : null)

	function openTop() {
		player?.open(url(top, 'before'))
	}

	function step(dir: number) {
		if (!several) return

		if (dir > 0) order.push(order.shift()!)
		else order.unshift(order.pop()!)

		seen = (seen + (dir > 0 ? 1 : demos.length - 1)) % demos.length
		openTop()
	}

	// Верхняя карточка улетает в ту сторону, куда её бросили, и уходит под низ колоды.
	function fly(dir: number) {
		drag = null
		flight = { id: order[0], dir }

		setTimeout(() => {
			flight = null
			step(1)
		}, 260)
	}

	function transform(id: string) {
		if (flight?.id === id) return `translateX(${flight.dir * 140}%) rotate(${flight.dir * 24}deg)`

		if (drag?.id === id) return `translateX(${drag.dx}px) rotate(${drag.dx / 18}deg)`

		return undefined
	}

	function grab(e: PointerEvent) {
		const card = e.currentTarget as HTMLElement

		if (!several || (e.target as HTMLElement).closest('button')) return

		drag = { id: order[0], x: e.clientX, dx: 0, pointer: e.pointerId }
		card.setPointerCapture(e.pointerId)
	}

	function move(e: PointerEvent) {
		if (drag && e.pointerId === drag.pointer) drag.dx = e.clientX - drag.x
	}

	function release(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointer) return

		const { dx } = drag

		drag = null

		if (Math.abs(dx) > 80) fly(Math.sign(dx))
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') fly(-1)

		if (e.key === 'ArrowLeft') step(-1)
	}

	// Выбор стиля снова показывает субтитры: именно их посетитель и хочет увидеть.
	function pickStyle(value: string) {
		style = value
		variant = 'after'
	}

	// Плеер сидит в той карточке, что сейчас сверху, и переезжает вместе с ней.
	const holdPlayer = (id: string) => (card: HTMLElement) => {
		if (player && order[0] === id) card.append(player.element())
	}

	// Видео грузится, только когда страница загрузилась и колода на экране.
	// На медленной сети оно забрало бы весь канал у шрифтов и текста,
	// а на телефоне колода ниже первого экрана, так что посетитель,
	// который до неё не долистал, видео и не скачает.
	let loaded = $state(false)
	let visible = $state(false)
	let started = false

	$effect(() => {
		if (started || !player || !loaded || !visible) return

		started = true
		untrack(openTop)
	})

	// Видео играет, только пока колода на экране.
	$effect(() => {
		const on = visible

		if (player) untrack(() => (on ? player!.play() : player!.pause()))
	})

	onMount(() => {
		order = shuffle(order)
		mounted = true

		loaded = document.readyState === 'complete'
		const onLoad = () => (loaded = true)

		addEventListener('load', onLoad, { once: true })

		const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.4 })

		io.observe(deck)

		return () => {
			removeEventListener('load', onLoad)
			io.disconnect()
		}
	})
</script>

<div class="rail">
	<div class="deck-wrap">
		<!-- Карусель по паттерну WAI-ARIA: в фокусе листается стрелками. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="deck"
			tabindex="0"
			role="group"
			aria-roledescription="колода"
			aria-label="Примеры видео, стрелки влево и вправо листают"
			bind:this={deck}
			onkeydown={keydown}
		>
			{#if mounted}
				{#each demos as demo (demo.id)}
					{@const i = order.indexOf(demo.id)}
					<!-- Свайп только шорткат: кнопки-стрелки и клавиши делают то же самое. -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="card"
						class:current={i === 0}
						class:dragging={drag?.id === demo.id}
						style:--i={i}
						style:z-index={order.length - i}
						style:opacity={flight?.id === demo.id || i > 2 ? '0' : undefined}
						style:transform={transform(demo.id)}
						onpointerdown={i === 0 ? grab : undefined}
						onpointermove={move}
						onpointerup={release}
						onpointercancel={release}
						{@attach holdPlayer(demo.id)}
					>
						<img
							class="card__poster"
							src={url(demo, 'poster', 'webp')}
							alt=""
							width="540"
							height="960"
							decoding="async"
						/>
					</div>
				{/each}
				<Player bind:this={player} screens={subtitles} {preset} />
			{/if}
		</div>
		<div class="deck-nav" hidden={!several}>
			<button class="nav" type="button" data-go="-1" aria-label="Предыдущее видео" onclick={() => step(-1)}>
				<svg class="nav__icon" viewBox="0 0 24 24" aria-hidden="true">
					<path d="m15 18-6-6 6-6"></path>
				</svg>
			</button>
			<span class="sr-only" aria-live="polite">{(seen % demos.length) + 1} / {demos.length}</span>
			<button class="nav" type="button" data-go="1" aria-label="Следующее видео" onclick={() => fly(-1)}>
				<svg class="nav__icon" viewBox="0 0 24 24" aria-hidden="true">
					<path d="m9 18 6-6-6-6"></path>
				</svg>
			</button>
		</div>
	</div>
</div>

<section id="demo" class="demo">
	<h2>Сравни сам</h2>
	<p class="sub">
		Смахни карточку, чтобы посмотреть другое видео. «До», «После» и стиль переключаются на ходу, с того же места.
	</p>
	<p class="note">{top.note}</p>
	<div class="toggle" role="radiogroup" aria-label="Версия">
		<button
			class="toggle__option"
			type="button"
			role="radio"
			aria-checked={variant === 'before'}
			onclick={() => (variant = 'before')}
		>
			До
		</button>
		<button
			class="toggle__option"
			type="button"
			role="radio"
			aria-checked={variant === 'after'}
			onclick={() => (variant = 'after')}
		>
			После
		</button>
	</div>
	<p class="label">Стиль</p>
	<div class="styles" role="radiogroup" aria-label="Стиль" aria-disabled={variant === 'before'}>
		{#each styles as s (s.id)}
			<button
				class="styles__option"
				type="button"
				role="radio"
				aria-checked={s.id === style}
				onclick={() => pickStyle(s.id)}
			>
				<b>{s.name}</b>
				<span class="styles__hint">{s.hint}</span>
			</button>
		{/each}
	</div>
	<p class="hint">
		Стиль по умолчанию выбирается командой /style, а у готового видео — кнопкой «Стиль», без повторного
		распознавания.
	</p>
</section>
