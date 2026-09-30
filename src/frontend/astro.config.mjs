import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://sublya.aimuzov.online',
  build: {
    // the whole stylesheet is a few KB: inside the page it saves a round trip before the first paint
    inlineStylesheets: 'always',
  },
})
