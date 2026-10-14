import sitemap from '@astrojs/sitemap'
import svelte from '@astrojs/svelte'
import { defineConfig } from 'astro/config'

export default defineConfig({
	// The site lives in src/frontend, the bot next to it in src/bot.
	srcDir: './src/frontend',
	// Absolute URLs in canonical, og:url and the sitemap.
	site: 'https://sublya.aimuzov.online',
	// There is little CSS, and inlined into the HTML it doesn't block
	// the first paint with a separate request.
	build: { inlineStylesheets: 'always' },
	// Svelte for interactive islands, the rest is static HTML with vanilla scripts.
	integrations: [svelte(), sitemap()],
	// Shiki highlighting is incompatible with CSP.
	markdown: { syntaxHighlight: false },
	// Astro puts a CSP with hashes of its own scripts and styles into the page <meta>.
	// The only external source is Yandex Metrika (mc.yandex.ru, yastatic.net).
	// frame-ancestors doesn't work in <meta>, Caddy blocks embedding via X-Frame-Options.
	security: {
		csp: {
			scriptDirective: { resources: ["'self'", 'https://mc.yandex.ru', 'https://yastatic.net'] },
			directives: [
				"default-src 'self'",
				"img-src 'self' data: https://mc.yandex.ru",
				"connect-src 'self' https://mc.yandex.ru",
				'frame-src blob: https://mc.yandex.ru',
				'child-src blob: https://mc.yandex.ru',
				"object-src 'none'",
				"base-uri 'self'",
				"form-action 'self'",
			],
		},
	},
})
