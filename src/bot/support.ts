// Чат поддержки: группа с темами, где у каждого пользователя своя тема со всей перепиской,
// а всё, что команда пишет в эту тему, уходит пользователю от имени бота.

import { AsyncLocalStorage } from 'node:async_hooks'
import { GrammyError, HttpError, type Api, type Context, type NextFunction, type Transformer } from 'grammy'
import type { CallbackQuery, Message, User } from 'grammy/types'

import type { Db } from '#bot/db.ts'
import * as texts from '#bot/texts.ts'

// Длиннее название темы Telegram не примет.
const TOPIC_NAME_LIMIT = 128
const ACK_EVERY = 3600
// Что команда может отправить пользователю, служебные сообщения самой темы остаются в группе.
const REPLY_TYPES = [
	'text',
	'photo',
	'video',
	'animation',
	'document',
	'audio',
	'voice',
	'video_note',
	'sticker',
] as const

const quietly = new AsyncLocalStorage<boolean>()

/** Сообщения бота, отправленные внутри, не попадают в чат поддержки: прогресс, который
 * правится и потом удаляется, оповещения админам. */
export const quiet = <T>(body: () => Promise<T>) => quietly.run(true, body)

/** Всё, чем может упасть вызов Bot API: ответ Telegram с ошибкой или отсутствие ответа. */
export const isTelegramError = (e: unknown): e is GrammyError | HttpError =>
	e instanceof GrammyError || e instanceof HttpError
export const isBadRequest = (e: unknown): e is GrammyError => e instanceof GrammyError && e.error_code === 400
export const isForbidden = (e: unknown): e is GrammyError => e instanceof GrammyError && e.error_code === 403

/** Тему удалили или закрыли в группе: это повод открыть новую, а не ошибка. */
export function threadGone(e: GrammyError): boolean {
	const text = e.description.toLowerCase()

	return ['thread not found', 'topic_deleted', 'topic deleted', 'topic_closed'].some((s) => text.includes(s))
}

/** Подпись кнопки, которую нажал пользователь, или callback data, если сообщения уже нет. */
export function pressed(query: CallbackQuery): string {
	const markup = query.message && 'reply_markup' in query.message ? query.message.reply_markup : undefined

	for (const row of markup?.inline_keyboard ?? []) {
		for (const button of row) {
			if ('callback_data' in button && button.callback_data === query.data) return button.text
		}
	}

	return query.data ?? ''
}

const fullName = (who: Pick<User, 'first_name' | 'last_name'>) =>
	[who.first_name, who.last_name].filter(Boolean).join(' ')
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export type SupportApi = Pick<Api, 'createForumTopic' | 'sendMessage' | 'sendVideo' | 'copyMessage' | 'getChat'>

export class Support {
	readonly api: SupportApi
	readonly db: Db
	readonly chatId: number | null
	// Два быстрых сообщения от нового пользователя не должны открыть две темы.
	private readonly opening = new Map<number, Promise<number | null>>()
	private readonly acked = new Map<number, number>()

	constructor(api: SupportApi, db: Db, chatId: number | null) {
		this.api = api
		this.db = db
		this.chatId = chatId
	}

	get enabled() {
		return this.chatId !== null
	}

	/** Пора ли сказать пользователю, что его сообщение передано. Не чаще раза в час: в переписке
	 * с командой одна и та же фраза после каждой реплики — просто шум. */
	ackDue(userId: number, now = performance.now() / 1000): boolean {
		// `performance.now()` идёт от старта процесса, без `-ACK_EVERY` в первый час после
		// рестарта подтверждений бы не было.
		if (now - (this.acked.get(userId) ?? -ACK_EVERY) < ACK_EVERY) return false

		this.acked.set(userId, now)

		return true
	}

	/** Тема пользователя, при первом обращении открывает новую. `null` — открыть не вышло. */
	topic(userId: number, who?: User): Promise<number | null> {
		const known = this.db.getTopic(userId)

		if (known !== null) return Promise.resolve(known)

		const running = this.opening.get(userId)

		if (running) return running

		const opening = this.open(userId, who).finally(() => this.opening.delete(userId))

		this.opening.set(userId, opening)

		return opening
	}

	private async open(userId: number, who?: User): Promise<number | null> {
		const chatId = this.chatId!

		if (!who) {
			// Бот написал первым (результат после рестарта), поэтому `User` под рукой нет.
			const chat = await this.api.getChat(userId)

			who = {
				id: userId,
				is_bot: false,
				first_name: 'first_name' in chat ? (chat.first_name ?? '') : '',
				last_name: 'last_name' in chat ? chat.last_name : undefined,
				username: 'username' in chat ? chat.username : undefined,
			}
		}

		const name = fullName(who).trim() || String(userId)
		const title = who.username ? `${name} @${who.username}` : name
		let topicId: number

		try {
			topicId = (await this.api.createForumTopic(chatId, title.slice(0, TOPIC_NAME_LIMIT))).message_thread_id
		} catch (e) {
			console.error(`could not open a support topic for user ${userId}`, e)

			return null
		}

		this.db.setTopic(userId, topicId)
		const card = texts.SUPPORT_CARD({
			name: escape(name),
			id: userId,
			lang: who.language_code ?? '?',
			username: who.username ? `@${escape(who.username)}, ` : '',
		})

		try {
			await this.api.sendMessage(chatId, card, { parse_mode: 'HTML', message_thread_id: topicId })
		} catch (e) {
			// Карточка — любезность, переписка продолжится и без неё.
			console.error(`could not post the card of topic ${topicId}`, e)
		}

		return topicId
	}

	/** Кладёт что-то в тему пользователя. Поддержка — побочный канал, поэтому ошибка здесь
	 * только пишется в лог и до видео пользователя не доходит. */
	private async post(userId: number, send: (topicId: number) => Promise<unknown>, who?: User) {
		if (this.chatId === null) return

		try {
			for (let attempt = 0; attempt < 2; attempt++) {
				const topicId = await this.topic(userId, who)

				if (topicId === null) return

				try {
					await send(topicId)

					return
				} catch (e) {
					if (attempt || !isBadRequest(e) || !threadGone(e)) throw e

					console.warn(`support topic ${topicId} of user ${userId} is gone, opening a new one`)

					// Параллельно отправленное сообщение могло уже открыть новую тему.
					if (this.db.getTopic(userId) === topicId) this.db.setTopic(userId, null)
				}
			}
		} catch (e) {
			console.error(`could not mirror to the support topic of user ${userId}`, e)
		}
	}

	incoming(message: Message) {
		return this.post(
			message.from!.id,
			(topicId) =>
				this.api.copyMessage(this.chatId!, message.chat.id, message.message_id, { message_thread_id: topicId }),
			message.from,
		)
	}

	button(query: CallbackQuery) {
		const text = texts.SUPPORT_BUTTON(pressed(query))

		return this.post(
			query.from.id,
			(topicId) => this.api.sendMessage(this.chatId!, text, { message_thread_id: topicId }),
			query.from,
		)
	}

	// Отправляем заново, а не копируем: копия унесла бы кнопки,
	// а работают они только у пользователя.
	async outgoing(userId: number, sent: Pick<Message, 'video' | 'text'>) {
		if (!sent.video && !sent.text) return

		await this.post(userId, (topicId) =>
			sent.video
				? this.api.sendVideo(this.chatId!, sent.video.file_id, { message_thread_id: topicId })
				: this.api.sendMessage(this.chatId!, texts.SUPPORT_BOT(sent.text!), { message_thread_id: topicId }),
		)
	}

	/** Сообщение команды в теме пользователя уходит этому пользователю. */
	async reply(message: Message) {
		if (message.chat.id !== this.chatId || !message.is_topic_message || !message.message_thread_id) return

		// Анонимные админы пишут от GroupAnonymousBot, но с группой в `sender_chat`.
		if (message.from?.is_bot && !message.sender_chat) return

		if (!REPLY_TYPES.some((type) => type in message) || message.text?.startsWith('/')) return

		const answer = (text: string) =>
			this.api.sendMessage(message.chat.id, text, {
				message_thread_id: message.message_thread_id,
				reply_parameters: { message_id: message.message_id },
			})
		const userId = this.db.userByTopic(message.message_thread_id)

		if (userId === null) {
			await answer(texts.SUPPORT_NO_USER)

			return
		}

		try {
			await this.api.copyMessage(userId, message.chat.id, message.message_id)
		} catch (e) {
			if (isForbidden(e)) await answer(texts.SUPPORT_BLOCKED)
			else if (isTelegramError(e))
				await answer(texts.SUPPORT_FAILED(e instanceof GrammyError ? e.description : e.message))
			else throw e
		}
	}
}

/** Всё, что бот отправляет пользователю, появляется в его теме, откуда бы ни отправлялось:
 * хоть из обработчиков, хоть из воркера. */
export const mirrorOutgoing =
	(support: Support): Transformer =>
	async (prev, method, payload, signal) => {
		const result = await prev(method, payload, signal)
		const chatId = (payload as { chat_id?: unknown }).chat_id

		if (
			(method === 'sendMessage' || method === 'sendVideo' || method === 'editMessageMedia') &&
			typeof chatId === 'number' &&
			// Положительный `chat_id` — личка, у групп и каналов он отрицательный.
			chatId > 0 &&
			result.ok &&
			!quietly.getStore()
		) {
			await support.outgoing(chatId, result.result as Message)
		}

		return result
	}

/** Мидлвара для пользовательской части. Зеркалит до обработчика, чтобы тема читалась
 * по порядку: сначала сообщение пользователя, потом ответ бота. */
export const mirrorIncoming = (support: Support) => async (ctx: Context, next: NextFunction) => {
	if (ctx.message && ctx.chat?.type === 'private' && ctx.from) await support.incoming(ctx.message)
	else if (ctx.callbackQuery) await support.button(ctx.callbackQuery)

	await next()
}
