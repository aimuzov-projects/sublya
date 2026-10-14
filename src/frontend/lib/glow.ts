/**
 * Бирюзовое свечение за всю страницу делает один круг вокруг середины экрана: стартует
 * слева, идёт вниз, по низу, вверх по правому краю и обратно поверху.
 *
 * Немного отстаёт от скролла, поэтому плывёт, а не прыгает вместе с колесом.
 */
export function glow() {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

	// Эллипс вокруг центра в процентах от экрана. Старт совпадает с дефолтными
	// `--glow-x`/`--glow-y` в global.css.
	const [rx, ry] = [38, 34]
	const start = Math.atan2(30 - 50, 12 - 50)
	const style = document.documentElement.style
	let current = 0
	let frame = 0

	function tick() {
		const range = document.documentElement.scrollHeight - innerHeight
		const target = range > 0 ? Math.min(scrollY / range, 1) : 0

		// За кадр догоняем цель на 8%, отсюда и отставание от скролла.
		current += (target - current) * 0.08
		// Ось y на экране смотрит вниз, поэтому убывающий угол сначала ведёт вниз по левому краю.
		const angle = start - current * 2 * Math.PI

		style.setProperty('--glow-x', `${(50 + rx * Math.cos(angle)).toFixed(2)}%`)
		style.setProperty('--glow-y', `${(50 + ry * Math.sin(angle)).toFixed(2)}%`)
		// Догнали цель -- цикл останавливаем, следующий запустит скролл.
		frame = Math.abs(target - current) > 0.0005 ? requestAnimationFrame(tick) : 0
	}

	addEventListener('scroll', () => (frame ||= requestAnimationFrame(tick)), { passive: true })
	tick()
}
