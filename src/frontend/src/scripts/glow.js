// The teal glow circles the middle of the screen once over the whole page: it starts on the
// left, goes down, across the bottom, up the right and over the top. It trails the scroll a
// little, so it glides instead of jumping with the wheel.
export function glow() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  // an ellipse around the centre, in percent of the screen; the start matches the CSS
  const [rx, ry] = [38, 34]
  const start = Math.atan2(30 - 50, 12 - 50)
  const style = document.documentElement.style
  let current = 0
  let frame = 0

  function tick() {
    const range = document.documentElement.scrollHeight - innerHeight
    const target = range > 0 ? Math.min(scrollY / range, 1) : 0
    current += (target - current) * 0.08
    // screen y grows downwards, so a falling angle goes down the left side first
    const angle = start - current * 2 * Math.PI
    style.setProperty('--glow-x', `${(50 + rx * Math.cos(angle)).toFixed(2)}%`)
    style.setProperty('--glow-y', `${(50 + ry * Math.sin(angle)).toFixed(2)}%`)
    frame = Math.abs(target - current) > 0.0005 ? requestAnimationFrame(tick) : 0
  }

  addEventListener('scroll', () => frame || (frame = requestAnimationFrame(tick)), { passive: true })
  tick()
}
