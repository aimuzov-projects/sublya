const once = (el, event, ms = 3000) =>
  new Promise((resolve) => {
    el.addEventListener(event, resolve, { once: true })
    setTimeout(resolve, ms) // a stalled network shouldn't freeze the switch forever
  })

const url = (demo, file, ext = 'mp4') => `/media/${demo.name}/${file}.${ext}?v=${demo.v}`

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Two stacked videos: the next version loads and seeks behind the one on screen and takes
// its place only once it plays, so switching keeps the moment and never flashes black.
class Player {
  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'player'
    this.videos = [0, 1].map(() => {
      const v = document.createElement('video')
      Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'auto' })
      this.root.append(v)
      return v
    })
    this.front = this.videos[0]
    this.front.classList.add('front')
    this.active = false
    this.seq = 0
  }

  async show(src, keepTime) {
    const seq = ++this.seq
    const cur = this.front
    const next = this.videos.find((v) => v !== cur)
    next.muted = cur.muted
    next.src = src
    await once(next, 'loadedmetadata')
    if (seq !== this.seq) return false
    // seeking takes a moment, so aim a bit ahead of where the playing video will be by then
    const ahead = keepTime && !cur.paused ? 0.12 : 0
    next.currentTime = keepTime ? Math.min(cur.currentTime + ahead, next.duration - 0.1) : 0
    await once(next, 'seeked')
    if (seq !== this.seq) return false
    if (this.active) await next.play().catch(() => {})
    if (seq !== this.seq) return false
    next.classList.add('front')
    cur.classList.remove('front')
    cur.pause()
    this.front = next
    return true
  }

  play() {
    this.active = true
    this.front.play().catch(() => {})
  }

  pause() {
    this.active = false
    for (const v of this.videos) v.pause()
  }

  get muted() {
    return this.front.muted
  }

  set muted(value) {
    for (const v of this.videos) v.muted = value
    if (!value) this.play()
  }
}

function soundButton(target) {
  const button = document.getElementById('sound-button').content.firstElementChild.cloneNode(true)
  const sync = () => {
    button.dataset.muted = String(target.muted)
    button.setAttribute('aria-label', target.muted ? 'Включить звук' : 'Выключить звук')
  }
  button.addEventListener('click', () => {
    target.muted = !target.muted
    sync()
  })
  sync()
  return button
}

function checkRadio(group, attr, value) {
  for (const b of group.querySelectorAll('[role="radio"]')) {
    b.setAttribute('aria-checked', String(b.dataset[attr] === value))
  }
}

// The teal glow circles the middle of the screen once over the whole page: it starts on the
// left, goes down, across the bottom, up the right and over the top. It trails the scroll a
// little, so it glides instead of jumping with the wheel.
function glow() {
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

glow()

async function main() {
  const demos = await fetch('/media/demos.json', { cache: 'no-cache' }).then((r) => r.json())
  let order = shuffle(demos)

  const deck = document.getElementById('deck')
  const count = document.getElementById('deck-count')
  const note = document.getElementById('demo-note')
  const toggle = document.querySelector('.toggle')
  const styles = document.querySelector('.styles')
  const player = new Player()
  let variant = 'after'
  let style = 'classic'
  let seen = 0

  player.root.append(soundButton(player))

  const cards = new Map(
    demos.map((demo) => {
      const card = document.createElement('div')
      card.className = 'card'
      const img = document.createElement('img')
      img.src = url(demo, 'poster', 'jpg')
      img.alt = ''
      card.append(img)
      deck.append(card)
      return [demo, card]
    }),
  )
  if (demos.length < 2) document.querySelector('.deck-nav').hidden = true

  const file = () => (variant === 'before' ? 'before' : style)

  function layout() {
    order.forEach((demo, i) => {
      const card = cards.get(demo)
      card.style.setProperty('--i', i)
      card.style.zIndex = String(order.length - i)
      card.style.opacity = i > 2 ? '0' : ''
      card.classList.toggle('current', i === 0)
    })
    const top = order[0]
    cards.get(top).append(player.root)
    note.textContent = top.note
    count.textContent = `${(seen % demos.length) + 1} / ${demos.length}`
  }

  async function openTop() {
    player.root.classList.add('loading')
    const shown = await player.show(url(order[0], file()), false)
    if (shown) player.root.classList.remove('loading')
  }

  function step(dir) {
    if (demos.length < 2) return
    if (dir > 0) order.push(order.shift())
    else order.unshift(order.pop())
    seen = (seen + (dir > 0 ? 1 : demos.length - 1)) % demos.length
    layout()
    openTop()
  }

  // the top card flies off to the side it was thrown, then goes under the stack
  function fly(dir) {
    const card = cards.get(order[0])
    card.classList.remove('dragging')
    card.style.transform = `translateX(${dir * 140}%) rotate(${dir * 24}deg)`
    card.style.opacity = '0'
    setTimeout(() => {
      card.style.transform = ''
      step(1)
    }, 260)
  }

  let drag = null
  deck.addEventListener('pointerdown', (e) => {
    const card = cards.get(order[0])
    if (!card.contains(e.target) || e.target.closest('button') || demos.length < 2) return
    drag = { x: e.clientX, dx: 0, card, id: e.pointerId }
    card.setPointerCapture(e.pointerId)
    card.classList.add('dragging')
  })
  deck.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return
    drag.dx = e.clientX - drag.x
    drag.card.style.transform = `translateX(${drag.dx}px) rotate(${drag.dx / 18}deg)`
  })
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return
    const { dx, card } = drag
    drag = null
    if (Math.abs(dx) > 80) return fly(Math.sign(dx))
    card.classList.remove('dragging')
    card.style.transform = ''
  }
  deck.addEventListener('pointerup', release)
  deck.addEventListener('pointercancel', release)

  document.querySelector('.deck-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]')
    if (!b) return
    if (b.dataset.go === '1') fly(-1)
    else step(-1)
  })
  deck.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') fly(-1)
    if (e.key === 'ArrowLeft') step(-1)
  })

  toggle.addEventListener('click', (e) => {
    const b = e.target.closest('[data-src]')
    if (!b || b.dataset.src === variant) return
    variant = b.dataset.src
    checkRadio(toggle, 'src', variant)
    styles.setAttribute('aria-disabled', String(variant === 'before'))
    player.show(url(order[0], file()), true)
  })

  styles.addEventListener('click', (e) => {
    const b = e.target.closest('[data-style]')
    if (!b || (b.dataset.style === style && variant === 'after')) return
    style = b.dataset.style
    variant = 'after'
    checkRadio(styles, 'style', style)
    checkRadio(toggle, 'src', variant)
    styles.setAttribute('aria-disabled', 'false')
    player.show(url(order[0], file()), true)
  })

  // the video plays only while on screen
  new IntersectionObserver(([entry]) => (entry.isIntersecting ? player.play() : player.pause()), {
    threshold: 0.4,
  }).observe(deck)

  layout()
  openTop()
}

// The last button teases a mouse: it dodges left, then right, then back to the middle, and
// gives in on the fourth try. Touch screens and keyboards get a plain button.
function dodgy() {
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

// A card under the cursor plays its text like the bot's subtitles: one word lit at a time,
// longer words longer, then a breath and again from the top.
function karaoke() {
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

// The step scenes play only while on screen: the first is pure CSS, the second types its
// caption, the third lights its subtitles word by word.
function scenes() {
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

  const io = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        target.classList.toggle('running', isIntersecting)
        if (target.classList.contains('scene-type')) {
          clearTimeout(loops.type)
          if (isIntersecting) typing()
        }
        if (target.classList.contains('scene-result')) {
          clearTimeout(loops.result)
          if (isIntersecting) lighting()
        }
      }
    },
    { threshold: 0.3 },
  )
  for (const scene of document.querySelectorAll('.scene')) io.observe(scene)
}

scenes()
karaoke()
dodgy()
main()
