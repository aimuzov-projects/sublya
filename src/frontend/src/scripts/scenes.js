// The step scenes play only while on screen: the first is pure CSS, the second types its
// caption, the third lights its subtitles word by word.
export function scenes() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const typed = document.querySelector('.scene-type .typed')
  const words = [...document.querySelectorAll('.scene-result .subs span')]
  if (reduced) {
    if (typed) typed.textContent = typed.dataset.text
    return
  }
  const loops = {}

  const typing = () => {
    const text = typed.dataset.text
    let i = 0
    const step = () => {
      typed.textContent = text.slice(0, i)
      if (i++ < text.length) return (loops.type = setTimeout(step, 55 + Math.random() * 60))
      loops.type = setTimeout(() => ((i = 0), step()), 1800)
    }
    step()
  }
  const lighting = () => {
    let i = 0
    const step = () => {
      words.forEach((w, j) => w.classList.toggle('lit', j === i % (words.length + 1)))
      i++
      loops.result = setTimeout(step, 650)
    }
    step()
  }

  // stops a scene, and starts it from the beginning when asked to
  const run = (scene, on) => {
    scene.classList.remove('running')
    if (scene.classList.contains('scene-type')) clearTimeout(loops.type)
    if (scene.classList.contains('scene-result')) clearTimeout(loops.result)
    if (!on) return
    void scene.offsetWidth // restarts the CSS animations
    scene.classList.add('running')
    if (scene.classList.contains('scene-type') && typed) typing()
    if (scene.classList.contains('scene-result')) lighting()
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) run(target, isIntersecting)
    },
    { threshold: 0.3 },
  )
  for (const scene of document.querySelectorAll('.scene')) {
    io.observe(scene)
    scene.closest('li').addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') run(scene, true)
    })
  }
}
