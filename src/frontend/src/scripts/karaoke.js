// A card under the cursor plays its text like the bot's subtitles: one word lit at a time,
// longer words longer, then a breath and again from the top.
export function karaoke() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  for (const card of document.querySelectorAll('.cards article')) {
    const text = card.querySelector('p')
    if (!text || reduced) continue
    const words = text.textContent.split(/(\s+)/).map((part) => {
      if (!part.trim()) return document.createTextNode(part)
      const span = document.createElement('span')
      span.className = 'w'
      span.textContent = part
      return span
    })
    text.replaceChildren(...words)
    const spans = words.filter((w) => w.nodeType === 1)
    let timer = 0

    const stop = () => {
      clearTimeout(timer)
      for (const s of spans) s.classList.remove('lit')
    }
    const play = (i = 0) => {
      spans.forEach((s, j) => s.classList.toggle('lit', j === i))
      if (i === spans.length) {
        timer = setTimeout(play, 700)
        return
      }
      timer = setTimeout(() => play(i + 1), 110 + spans[i].textContent.length * 38)
    }
    card.addEventListener('pointerenter', () => {
      stop()
      play()
    })
    card.addEventListener('pointerleave', stop)
  }
}
