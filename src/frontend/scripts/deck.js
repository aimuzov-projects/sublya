import { withBase } from './base.js'

const once = (el, event, ms = 3000) =>
  new Promise((resolve) => {
    el.addEventListener(event, resolve, { once: true })
    setTimeout(resolve, ms) // a stalled network shouldn't freeze the switch forever
  })

const url = (demo, file, ext = 'mp4') => withBase(`media/${demo.id}/${file}.${ext}?v=${demo.v}`)

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
    this.root.classList.add('switching')
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
    // whoever wins shows the video: a style picked while a card loads cancels its open
    this.root.classList.remove('loading', 'switching')
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

export function deck() {
  const deck = document.getElementById('deck')
  const demos = JSON.parse(deck.dataset.demos)
  let order = shuffle(demos)

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
      Object.assign(img, { src: url(demo, 'poster', 'webp'), alt: '', width: 540, height: 960, decoding: 'async' })
      card.append(img)
      deck.append(card)
      return [demo, card]
    }),
  )
  if (demos.length < 2) document.querySelector('.deck-nav').hidden = true

  const file = () => (variant === 'before' ? 'before' : style)
  // until the card's own video is up, the time on screen belongs to the previous one
  const keepTime = () => !player.root.classList.contains('loading')

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
    await player.show(url(order[0], file()), false)
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
    player.show(url(order[0], file()), keepTime())
  })

  styles.addEventListener('click', (e) => {
    const b = e.target.closest('[data-style]')
    if (!b || (b.dataset.style === style && variant === 'after')) return
    style = b.dataset.style
    variant = 'after'
    checkRadio(styles, 'style', style)
    checkRadio(toggle, 'src', variant)
    styles.setAttribute('aria-disabled', 'false')
    player.show(url(order[0], file()), keepTime())
  })

  // The video loads only once the page has and the deck is on screen: on a slow network it
  // would take the whole channel from the fonts and the text, and on a phone the deck is
  // below the first screen, so a visitor who never scrolls down never downloads it.
  let loaded = document.readyState === 'complete'
  let visible = false
  let started = false
  const start = () => {
    if (started || !loaded || !visible) return
    started = true
    openTop()
  }
  addEventListener('load', () => ((loaded = true), start()), { once: true })

  // the video plays only while on screen
  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting
      if (visible) player.play()
      else player.pause()
      start()
    },
    { threshold: 0.4 },
  ).observe(deck)

  layout()
}
