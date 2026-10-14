// A bot without a network for the tests: every Bot API call is recorded and answered here.

import { Bot, GrammyError, HttpError } from 'grammy'
import type { Update, UserFromGetMe } from 'grammy/types'

export type Call = { method: string; payload: Record<string, unknown> }
type Answer = (payload: Record<string, unknown>) => unknown

const ME: UserFromGetMe = {
	id: 1,
	is_bot: true,
	first_name: 'Сабля',
	username: 'sublyarobot',
	can_join_groups: true,
	can_read_all_group_messages: false,
	supports_inline_queries: false,
	can_connect_to_business: false,
	has_main_web_app: false,
	has_topics_enabled: false,
	allows_users_to_create_topics: false,
} as UserFromGetMe

/** A Bot API error, for an answer to throw. */
export const apiError = (method: string, code: number, description: string) =>
	new GrammyError(`Call to '${method}' failed!`, { ok: false, error_code: code, description }, method, {})

/** No answer from Telegram at all, as when the tunnel is down. */
export const networkError = (method: string) =>
	new HttpError(`Network request for '${method}' failed!`, new TypeError('fetch failed'))

export function fakeBot() {
	const bot = new Bot('1:token', { botInfo: ME })
	const calls: Call[] = []
	const answers = new Map<string, Answer>()
	// the next call of a method fails with this Bot API error
	const failures = new Map<string, { code: number; description: string }>()
	let messageId = 1000

	bot.api.config.use(async (_prev, method, payload) => {
		const p = (payload ?? {}) as Record<string, unknown>

		calls.push({ method, payload: p })
		const failure = failures.get(method)

		if (failure) {
			failures.delete(method)

			throw new GrammyError(
				`Call to '${method}' failed!`,
				{ ok: false, error_code: failure.code, description: failure.description },
				method,
				p,
			)
		}

		const answer = answers.get(method)
		const result = answer
			? answer(p)
			: { message_id: ++messageId, date: 0, chat: { id: p.chat_id, type: 'private' }, text: p.text }

		return { ok: true, result } as never
	})

	return {
		bot,
		api: bot.api,
		calls,
		named: (method: string) => calls.filter((c) => c.method === method).map((c) => c.payload),
		answer: (method: string, fn: Answer) => answers.set(method, fn),
		fail: (method: string, code: number, description: string) => failures.set(method, { code, description }),
		feed: (update: object) => bot.handleUpdate({ update_id: ++messageId, ...update } as Update),
	}
}
