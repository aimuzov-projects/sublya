import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://sublya.aimuzov.online',
  // the Pages mirror lives under /site, see .github/workflows/pages.yml
  base: process.env.SITE_BASE ?? '/',
  build: {
    // the whole stylesheet is a few KB: inside the page it saves a round trip before the first paint
    inlineStylesheets: 'always',
  },
})
