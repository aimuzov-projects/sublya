import { defineCollection } from 'astro:content'
import { file } from 'astro/loaders'
import { z } from 'astro/zod'

// По записи на каждую демку в колоде. demo/make-demo.sh кладёт файлы в public/media/<id>/
// и дописывает этот список; `note` пишется руками, поэтому без неё сборка падает.
const demos = defineCollection({
	loader: file('src/frontend/data/demos.json'),
	schema: z.object({
		id: z.string(),
		note: z.string().min(1),
		// Версия файлов для `?v=` в URL: новые файлы -- новые адреса, кеш браузера не мешает.
		v: z.string(),
		duration: z.number(),
	}),
})

export const collections = { demos }
