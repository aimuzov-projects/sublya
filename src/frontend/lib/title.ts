import { site } from '#frontend/data/site.ts'

/**
 * Заголовок страницы: её название и через тире название сайта.
 * У главной страницы -- просто заголовок сайта.
 */
export function pageTitle(title?: string) {
	return title ? `${title} — ${site.name}` : site.title
}
