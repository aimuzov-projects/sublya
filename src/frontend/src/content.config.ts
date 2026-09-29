import { defineCollection } from 'astro:content'
import { file } from 'astro/loaders'
import { z } from 'astro/zod'

// One entry per demo in the deck. demo/make-demo.sh writes the files to public/media/<id>/
// and this list; the note is written by hand, so the build fails if it's missing.
const demos = defineCollection({
  loader: file('src/data/demos.json'),
  schema: z.object({
    id: z.string(),
    note: z.string().min(1),
    v: z.string(),
    duration: z.number(),
  }),
})

export const collections = { demos }
