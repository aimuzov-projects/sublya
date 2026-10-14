// The last button teases a mouse: it dodges left, then right, then back to the middle, and
// gives in on the fourth try. Touch screens and keyboards get a plain button.
export function dodgy() {
  const btn = document.querySelector('.final .btn')
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!btn || !fine || reduced) return
  const name = btn.textContent
  // where each dodge goes: -1 left, 1 right, 0 home
  const dodges = [
    { side: -1, text: 'Мимо!' },
    { side: 1, text: 'Ещё разок' },
    { side: 0, text: 'Почти!' },
  ]
  let tries = 0

  btn.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || tries > dodges.length) return
    if (tries++ === dodges.length) {
      btn.textContent = name
      btn.classList.add('caught')
      return
    }
    const { side, text } = dodges[tries - 1]
    btn.textContent = text
    if (!side) {
      btn.style.transform = ''
      return
    }
    // as far as the section allows, so it stays in sight
    const room = btn.parentElement.clientWidth / 2 - btn.offsetWidth / 2 - 16
    const x = side * Math.min(room, 320) * (0.75 + Math.random() * 0.25)
    // on a narrow screen the side step is short, so it also hops down off the cursor
    const y = Math.abs(x) < btn.offsetWidth ? 70 : (Math.random() - 0.5) * 60
    btn.style.transform = `translate(${x | 0}px, ${y | 0}px) rotate(${side * 5}deg)`
  })
}
