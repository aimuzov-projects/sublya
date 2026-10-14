// Yandex Metrika; why this is a file of its own, see src/frontend/components/metrika.astro.
;(function (m, e, t, r, i, k, a) {
	m[i] =
		m[i] ||
		function () {
			;(m[i].a = m[i].a || []).push(arguments)
		}
	m[i].l = 1 * new Date()
	for (var j = 0; j < document.scripts.length; j++) {
		if (document.scripts[j].src === r) {
			return
		}
	}
	var events = ['scroll', 'pointerdown', 'keydown', 'touchstart']
	var load = function () {
		if (k) return
		events.forEach(function (name) {
			m.removeEventListener(name, load)
		})
		k = e.createElement(t)
		a = e.getElementsByTagName(t)[0]
		k.async = 1
		k.src = r
		a.parentNode.insertBefore(k, a)
	}
	events.forEach(function (name) {
		m.addEventListener(name, load, { passive: true })
	})
	var later = function () {
		setTimeout(load, 4000)
	}
	if (e.readyState === 'complete') later()
	else m.addEventListener('load', later)
})(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=113179171', 'ym')

ym(113179171, 'init', {
	ssr: true,
	webvisor: false,
	clickmap: true,
	ecommerce: 'dataLayer',
	referrer: document.referrer,
	url: location.href,
	accurateTrackBounce: true,
	trackLinks: true,
})
