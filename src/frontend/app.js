function setSoundIcon(button, video) {
  button.dataset.muted = String(video.muted)
  button.setAttribute('aria-label', video.muted ? 'Включить звук' : 'Выключить звук')
}

// only one video speaks at a time
for (const button of document.querySelectorAll('[data-sound-for]')) {
  const video = document.getElementById(button.dataset.soundFor)
  button.addEventListener('click', () => {
    const unmute = video.muted
    for (const other of document.querySelectorAll('[data-sound-for]')) {
      const v = document.getElementById(other.dataset.soundFor)
      v.muted = true
      setSoundIcon(other, v)
    }
    video.muted = !unmute
    if (unmute) video.play()
    setSoundIcon(button, video)
  })
}

// before/after and the four styles share one timeline, so switching shows the same
// moment of the video in another look
const demo = document.getElementById('demo-video')
// set by demo/make-demo.sh: a rebuilt demo gets new URLs, so no browser keeps the old one
const MEDIA = document.body.dataset.media
const toggle = document.querySelector('.toggle')
const styles = document.querySelector('.styles')
let version = 'after'
let style = 'classic'

function check(group, attr, value) {
  for (const b of group.querySelectorAll('[role="radio"]')) {
    b.setAttribute('aria-checked', String(b.dataset[attr] === value))
  }
}

function load() {
  const at = demo.currentTime
  const playing = !demo.paused
  demo.src = `/media/${version === 'before' ? 'before' : style}.mp4?v=${MEDIA}`
  demo.addEventListener(
    'loadedmetadata',
    () => {
      demo.currentTime = at
      if (playing) demo.play()
    },
    { once: true },
  )
  styles.setAttribute('aria-disabled', String(version === 'before'))
}

toggle.addEventListener('click', (e) => {
  const b = e.target.closest('[data-src]')
  if (!b) return
  version = b.dataset.src
  check(toggle, 'src', version)
  load()
})

styles.addEventListener('click', (e) => {
  const b = e.target.closest('[data-style]')
  if (!b) return
  style = b.dataset.style
  version = 'after'
  check(styles, 'style', style)
  check(toggle, 'src', version)
  load()
})

// videos play only while on screen
const onScreen = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) entry.target.play().catch(() => {})
      else entry.target.pause()
    }
  },
  { threshold: 0.4 },
)
onScreen.observe(demo)
onScreen.observe(document.getElementById('hero-video'))

// the chat replays the bot's progress messages once it scrolls into view
const chat = document.getElementById('chat')
const status = document.getElementById('status')
const STATUS = ['Распознаю речь…', 'Рендерю…']
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms))

function showStep(n) {
  chat.querySelector(`[data-step="${n}"]`).classList.add('shown')
}

async function playChat() {
  showStep(0)
  await wait(700)
  showStep(1)
  for (const text of STATUS) {
    await wait(1100)
    status.textContent = text
  }
  await wait(1200)
  // like the bot, the progress message goes away once the video arrives
  chat.querySelector('[data-step="1"]').remove()
  showStep(2)
}

new IntersectionObserver(
  (entries, observer) => {
    if (entries.some((e) => e.isIntersecting)) {
      observer.disconnect()
      playChat()
    }
  },
  { threshold: 0.5 },
).observe(chat)
