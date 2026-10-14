import { defineMiddleware } from 'astro:middleware'

import { typograph } from '#shared/typograph.ts'

// Каждая страница при сборке проходит через типограф, поэтому и текст,
// добавленный позже, будет оформлен правильно. Пропсы островов -- это атрибуты,
// их типограф не трогает, для них `typographText` вызывается в самом компоненте.
export const onRequest = defineMiddleware(async (_, next) => {
	const response = await next()

	if (!response.headers.get('content-type')?.startsWith('text/html')) return response

	const headers = new Headers(response.headers)

	// После типографа тело другой длины, старый `content-length` уже неверен.
	headers.delete('content-length')

	return new Response(typograph(await response.text()), {
		status: response.status,
		statusText: response.statusText,
		headers,
	})
})
