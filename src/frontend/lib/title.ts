import { site } from '#frontend/data/site.ts'

/** Page title: its own name and the site name after a dash, the home page gets the site title. */
export function pageTitle(title?: string) {
	return title ? `${title} — ${site.name}` : site.title
}
