import { defineMiddleware } from 'astro:middleware'

import { typograph } from '#frontend/lib/typograph.ts'

// Every page goes through the typograph as it's built, so text added later is set right too.
// Island props are attributes, which it doesn't touch: those get typographText in the component.
export const onRequest = defineMiddleware(async (_, next) => {
	const response = await next()
	if (!response.headers.get('content-type')?.startsWith('text/html')) return response
	const headers = new Headers(response.headers)
	headers.delete('content-length')
	return new Response(typograph(await response.text()), {
		status: response.status,
		statusText: response.statusText,
		headers,
	})
})
