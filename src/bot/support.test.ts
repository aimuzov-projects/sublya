import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Message, User } from 'grammy/types'

import { defaults, type Settings } from '#bot/config.ts'
import { Db } from '#bot/db.ts'
import { handlers } from '#bot/handlers.ts'
import { mirrorIncoming, mirrorOutgoing, Support } from '#bot/support.ts'
import { fakeBot, networkError } from '#bot/testing.ts'
import * as texts from '#bot/texts.ts'
import type { Worker } from '#bot/worker.ts'

const GROUP = -1001
const ALICE: User = { id: 42, is_bot: false, first_name: 'Alice', username: 'alice', language_code: 'ru' }
const ADMIN: User = { id: 7, is_bot: false, first_name: 'Admin' }

function setup(chatId: number | null = GROUP) {
	const fake = fakeBot()
	let topic = 100
	fake.answer('createForumTopic', () => ({ message_thread_id: ++topic, name: 'x', icon_color: 0 }))
	fake.answer('copyMessage', () => ({ message_id: 1 }))
	const db = new Db(':memory:')
	return { ...fake, db, support: new Support(fake.api, db, chatId) }
}

const message = (text = 'привет', id = 10): Message =>
	({
		message_id: id,
		date: 0,
		chat: { id: ALICE.id, type: 'private', first_name: 'Alice' },
		from: ALICE,
		text,
	}) as Message

const inGroup = ({
	text = 'ответ' as string | null,
	thread = 101 as number | null,
	chatId = GROUP,
	from = ADMIN,
	...extra
} = {}): Message =>
	({
		message_id: 20,
		date: 0,
		chat: { id: chatId, type: 'supergroup', title: 'support', is_forum: true },
		from,
		...(thread !== null ? { message_thread_id: thread, is_topic_message: true } : {}),
		...(text !== null ? { text } : {}),
		...extra,
	}) as Message

test('the first message opens a topic with a card', async () => {
	const { support, named, db } = setup()
	await support.incoming(message())
	await support.incoming(message('ещё'))

	assert.deepEqual(named('createForumTopic'), [{ chat_id: GROUP, name: 'Alice @alice' }])
	const [card] = named('sendMessage')
	assert.ok(String(card.text).includes('<code>42</code>'))
	assert.equal(card.message_thread_id, 101)
	const copies = named('copyMessage')
	assert.equal(copies.length, 2)
	for (const c of copies)
		assert.deepEqual(c, { chat_id: GROUP, from_chat_id: ALICE.id, message_id: 10, message_thread_id: 101 })
	assert.equal(db.userByTopic(101), ALICE.id)
})

test('two quick messages open one topic', async () => {
	const { support, named } = setup()
	await Promise.all([support.incoming(message()), support.incoming(message('ещё', 11))])
	assert.equal(named('createForumTopic').length, 1)
})

test('a deleted topic is replaced', async () => {
	const { support, named, db, fail } = setup()
	db.setTopic(ALICE.id, 55)
	fail('copyMessage', 400, 'Bad Request: message thread not found')
	await support.incoming(message())
	assert.equal(db.getTopic(ALICE.id), 101)
	assert.deepEqual(
		named('copyMessage').map((c) => c.message_thread_id),
		[55, 101],
	)
})

test("support failures don't reach the user", async () => {
	const { support, named, fail } = setup()
	fail('createForumTopic', 400, 'Bad Request: the chat is not a forum')
	await support.incoming(message())
	assert.deepEqual(named('copyMessage'), [])
})

test('disabled support does nothing', async () => {
	const { support, calls } = setup(null)
	await support.incoming(message())
	assert.deepEqual(calls, [])
})

test("the bot's video is sent again, without the buttons", async () => {
	const { support, named, db } = setup()
	db.setTopic(ALICE.id, 101)
	await support.outgoing(ALICE.id, { video: { file_id: 'VID' } as Message['video'] })
	assert.deepEqual(named('sendVideo'), [{ chat_id: GROUP, video: 'VID', message_thread_id: 101 }])
})

test("the team's reply goes to the user", async () => {
	const { support, named, db } = setup()
	db.setTopic(ALICE.id, 101)
	await support.reply(inGroup())
	assert.deepEqual(named('copyMessage'), [{ chat_id: ALICE.id, from_chat_id: GROUP, message_id: 20 }])
})

const never = {
	command: inGroup({ text: '/stats' }),
	'command with the bot name': inGroup({ text: '/stats@sublyarobot' }),
	'General topic': inGroup({ thread: null }),
	'another bot': inGroup({ from: { id: 1, is_bot: true, first_name: 'bot' } }),
	'service message': inGroup({ text: null, forum_topic_edited: { name: 'x' } } as never),
	'another group': inGroup({ chatId: -999 }),
}
for (const [name, msg] of Object.entries(never)) {
	test(`never reaches the user: ${name}`, async () => {
		const { support, calls, db } = setup()
		db.setTopic(ALICE.id, 101)
		await support.reply(msg)
		assert.deepEqual(calls, [])
	})
}

test('an orphan topic warns the team', async () => {
	const { support, named } = setup()
	await support.reply(inGroup({ thread: 555 }))
	assert.deepEqual(
		named('sendMessage').map((m) => m.text),
		[texts.SUPPORT_NO_USER],
	)
})

test('a blocked user warns the team', async () => {
	const { support, named, db, fail } = setup()
	db.setTopic(ALICE.id, 101)
	fail('copyMessage', 403, 'Forbidden: bot was blocked by the user')
	await support.reply(inGroup())
	assert.deepEqual(
		named('sendMessage').map((m) => m.text),
		[texts.SUPPORT_BLOCKED],
	)
})

test('one ack an hour', () => {
	const { support } = setup()
	assert.ok(support.ackDue(ALICE.id, 0))
	assert.ok(!support.ackDue(ALICE.id, 1800))
	assert.ok(support.ackDue(ALICE.id, 3600))
	assert.ok(support.ackDue(8, 1800))
})

test('the outgoing mirror hands the result back and mirrors it', async () => {
	const { support, api, db, named } = setup()
	db.setTopic(ALICE.id, 101)
	api.config.use(mirrorOutgoing(support))
	const sent = await api.sendMessage(ALICE.id, 'Готово.')
	assert.equal(sent.text, 'Готово.')
	assert.deepEqual(
		named('sendMessage').map((m) => [m.chat_id, m.text]),
		[
			[ALICE.id, 'Готово.'],
			[GROUP, texts.SUPPORT_BOT('Готово.')],
		],
	)
})

/** The bot as main.ts puts it together, with two private texts or one group message fed in. */
async function wired(chatId: number | null) {
	const s = setup(chatId)
	const settings: Settings = {
		...defaults,
		botToken: '1:token',
		stt: { url: '', key: 'k', model: '' },
		supportChatId: chatId,
	}
	if (s.support.enabled) s.bot.use(mirrorIncoming(s.support))
	s.bot.use(handlers({ db: s.db, worker: { wake() {} } as Worker, settings, support: s.support }))
	return s
}

const texted = (s: Awaited<ReturnType<typeof wired>>) =>
	s
		.named('sendMessage')
		.filter((m) => m.chat_id === ALICE.id)
		.map((m) => m.text)

test('a text goes to support with one ack', async () => {
	const s = await wired(GROUP)
	for (const id of [10, 11]) await s.feed({ message: message('есть вопрос', id) })
	assert.deepEqual(texted(s), [texts.FORWARDED])
})

test('without support a text is not a video', async () => {
	const s = await wired(null)
	for (const id of [10, 11]) await s.feed({ message: message('есть вопрос', id) })
	assert.deepEqual(texted(s), [texts.NOT_VIDEO, texts.NOT_VIDEO])
})

test('groups never get the not-a-video answer', async () => {
	const s = await wired(GROUP)
	await s.feed({ message: inGroup({ text: 'что-то', chatId: -999 }) })
	assert.deepEqual(s.calls, [])
})

test('a reply lost to the network warns the team', async () => {
	const { support, named, db, answer } = setup()
	db.setTopic(ALICE.id, 101)
	answer('copyMessage', () => {
		throw networkError('copyMessage')
	})
	await support.reply(inGroup())
	assert.ok(String(named('sendMessage')[0].text).startsWith('⚠️ Не доставлено'))
})

test('a topic opened alongside is not thrown away', async () => {
	const { support, db, fail, named } = setup()
	db.setTopic(ALICE.id, 55)
	fail('copyMessage', 400, 'Bad Request: message thread not found')
	// another message already replaced the dead topic with 77
	const copy = support.api.copyMessage.bind(support.api)
	support.api.copyMessage = (async (...args: Parameters<typeof copy>) => {
		const result = copy(...args)
		db.setTopic(ALICE.id, 77)
		return result
	}) as typeof copy
	await support.incoming(message())
	assert.equal(db.getTopic(ALICE.id), 77)
	assert.deepEqual(named('createForumTopic'), [])
})
