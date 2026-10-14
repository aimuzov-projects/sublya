// Support chat: a forum group where every user has a topic with their whole dialogue, and
// whatever the team writes in that topic goes back to the user from the bot.

import { AsyncLocalStorage } from 'node:async_hooks'
import { GrammyError, type Api, type Context, type NextFunction, type Transformer } from 'grammy'
import type { CallbackQuery, Message, User } from 'grammy/types'

import type { Db } from '#bot/db.ts'
import * as texts from '#bot/texts.ts'

const TOPIC_NAME_LIMIT = 128
const ACK_EVERY = 3600
// what the team may send to a user; service messages of the topic itself stay in the group
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

/** Bot messages sent inside stay out of the support chat: the progress message that is edited
 * and then deleted, alerts to admins. */
export const quiet = <T>(body: () => Promise<T>) => quietly.run(true, body)

export const isBadRequest = (e: unknown): e is GrammyError => e instanceof GrammyError && e.error_code === 400
export const isForbidden = (e: unknown): e is GrammyError => e instanceof GrammyError && e.error_code === 403

/** The topic was deleted or closed in the group: a reason to open a new one, not a failure. */
export function threadGone(e: GrammyError): boolean {
	const text = e.description.toLowerCase()
	return ['thread not found', 'topic_deleted', 'topic deleted', 'topic_closed'].some((s) => text.includes(s))
}

/** The label of the button the user pressed; callback data if the message is gone. */
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
	// two quick messages from a new user must not open two topics
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

	/** Whether to tell the user their message was passed on. Once an hour at most: in a
	 * dialogue with the team the same words after every line are just noise. */
	ackDue(userId: number, now = performance.now() / 1000): boolean {
		if (now - (this.acked.get(userId) ?? -ACK_EVERY) < ACK_EVERY) return false
		this.acked.set(userId, now)
		return true
	}

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
			// the bot wrote first (a result after a restart), so there is no User at hand
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
			// the card is a courtesy, the dialogue goes on without it
			console.error(`could not post the card of topic ${topicId}`, e)
		}
		return topicId
	}

	/** Puts something into the user's topic. Support is a side channel, so a failure here is
	 * logged and never reaches the user's video. */
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
					this.db.setTopic(userId, null)
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

	// sent again instead of copied: a copy would carry the buttons, and they only work for the user
	async outgoing(userId: number, sent: Pick<Message, 'video' | 'text'>) {
		if (!sent.video && !sent.text) return
		await this.post(userId, (topicId) =>
			sent.video
				? this.api.sendVideo(this.chatId!, sent.video.file_id, { message_thread_id: topicId })
				: this.api.sendMessage(this.chatId!, texts.SUPPORT_BOT(sent.text!), { message_thread_id: topicId }),
		)
	}

	/** A message of the team in a user's topic goes to that user. */
	async reply(message: Message) {
		if (message.chat.id !== this.chatId || !message.is_topic_message || !message.message_thread_id) return
		// anonymous admins write as GroupAnonymousBot, but with the group as sender_chat
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
			else if (e instanceof GrammyError) await answer(texts.SUPPORT_FAILED(e.description))
			else throw e
		}
	}
}

/** Everything the bot sends to a user shows up in their topic, wherever it was sent from:
 * handlers and the worker alike. */
export const mirrorOutgoing =
	(support: Support): Transformer =>
	async (prev, method, payload, signal) => {
		const result = await prev(method, payload, signal)
		const chatId = (payload as { chat_id?: unknown }).chat_id
		if (
			(method === 'sendMessage' || method === 'sendVideo') &&
			typeof chatId === 'number' &&
			chatId > 0 &&
			result.ok &&
			!quietly.getStore()
		) {
			await support.outgoing(chatId, result.result as Message)
		}
		return result
	}

/** Middleware for the user-facing part. Mirrors before the handler, so the topic reads in
 * order: the user's message, then the bot's answer. */
export const mirrorIncoming = (support: Support) => async (ctx: Context, next: NextFunction) => {
	if (ctx.message && ctx.chat?.type === 'private' && ctx.from) await support.incoming(ctx.message)
	else if (ctx.callbackQuery) await support.button(ctx.callbackQuery)
	await next()
}
