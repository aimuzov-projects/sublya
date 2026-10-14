import sitemap from '@astrojs/sitemap'
import svelte from '@astrojs/svelte'
import { defineConfig } from 'astro/config'

export default defineConfig({
	// Сайт живёт в `src/frontend`, бот рядом, в `src/bot`.
	srcDir: './src/frontend',
	// Абсолютные URL в canonical, og:url и sitemap.
	site: 'https://sublya.aimuzov.online',
	// CSS мало, и вписанный прямо в HTML он не блокирует первую отрисовку
	// отдельным запросом.
	build: { inlineStylesheets: 'always' },
	// Svelte для интерактивных островов, остальное -- статический HTML
	// с ванильными скриптами.
	integrations: [svelte(), sitemap()],
	// Подсветка Shiki несовместима с CSP.
	markdown: { syntaxHighlight: false },
	// Astro кладёт в `<meta>` страницы CSP с хешами своих скриптов и стилей.
	// Компонент Яндекс Метрики из infra-site-kit сам добавляет свой хеш и источники.
	// `frame-ancestors` в `<meta>` не работает, поэтому встраивание блокирует Caddy
	// через `X-Frame-Options`.
	security: {
		csp: {
			scriptDirective: { resources: ["'self'"] },
			directives: [
				"default-src 'self'",
				"img-src 'self' data:",
				"connect-src 'self'",
				"object-src 'none'",
				"base-uri 'self'",
				"form-action 'self'",
			],
		},
	},
})
