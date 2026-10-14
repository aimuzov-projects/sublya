import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { makeHandler, OpenRouter, Profiles, verifyInitData } from '#bot/admin.ts'
import { defaults, type Settings } from '#bot/config.ts'
import { Db } from '#bot/db.ts'
import { apiError, fakeBot } from '#bot/testing.ts'

const TOKEN = '123:secret'
const NOW = 1_790_000_000
const ADMIN = 7

function signed(userId = ADMIN, authDate = NOW, token = TOKEN): string {
	const fields: Record<string, string> = {
		auth_date: String(Math.trunc(authDate)),
		query_id: 'q',
		user: JSON.stringify({ id: userId, first_name: 'A' }),
		signature: 'sig',
	}
	const check = Object.keys(fields)
		.sort()
		.map((k) => `${k}=${fields[k]}`)
		.join('\n')
	const secret = createHmac('sha256', 'WebAppData').update(token).digest()
	fields.hash = createHmac('sha256', secret).update(check).digest('hex')
	return new URLSearchParams(fields).toString()
}

test('a valid signature gives the user', () => {
	assert.equal(verifyInitData(signed(), TOKEN, NOW + 60), ADMIN)
})

const bad = {
	empty: '',
	'another token': signed(ADMIN, NOW, '999:other'),
	tampered: signed().replace('query_id=q', 'query_id=x'),
	'too old': signed(ADMIN, NOW - 2 * 24 * 3600),
	'no signature': 'hash=abc&user=%7B%22id%22%3A7%7D',
}
for (const [name, initData] of Object.entries(bad)) {
	test(`bad initData is refused: ${name}`, () => assert.equal(verifyInitData(initData, TOKEN, NOW), null))
}

/** getChat knows Alice; user 3 blocked the bot. Alice has a photo, nobody else does. */
function setup() {
	const dataDir = mkdtempSync(join(tmpdir(), 'sublya-'))
	// apiUrl: files come as local paths, like from the server's Bot API
	const settings: Settings = {
		...defaults,
		botToken: TOKEN,
		adminIds: new Set([ADMIN]),
		dataDir,
		apiUrl: 'http://127.0.0.1:8081',
		stt: { url: '', key: 'k', model: '' },
	}
	const fake = fakeBot()
	const db = new Db(':memory:')
	for (const method of ['getChat', 'sendMessage']) {
		const answer = (p: Record<string, unknown>) =>
			method === 'getChat'
				? { id: p.chat_id, type: 'private', first_name: 'Alice', last_name: 'Smith', username: 'alice' }
				: { message_id: 1, date: 0, chat: { id: p.chat_id, type: 'private' } }
		fake.answer(method, (p) => {
			if (p.chat_id === 3) throw apiError(method, 403, 'Forbidden: bot was blocked by the user')
			return answer(p)
		})
	}
	fake.answer('getUserProfilePhotos', (p) => ({
		total_count: 1,
		photos: p.user_id === 1 ? [[{ file_id: 'F', file_unique_id: 'u', width: 160, height: 160 }]] : [],
	}))
	fake.answer('getFile', () => {
		const src = join(dataDir, 'photo.jpg')
		writeFileSync(src, 'jpeg')
		return { file_id: 'F', file_unique_id: 'u', file_path: src }
	})
	return { ...fake, settings, db, profiles: new Profiles(fake.api, db, settings) }
}

test('missing names are asked once', async () => {
	const { profiles, db, named } = setup()
	const rows = [
		{ user_id: 1, name: null as string | null, username: null as string | null },
		{ user_id: 3, name: null, username: null },
		{ user_id: 5, name: 'Known', username: null },
	]
	await profiles.fillNames(rows)
	assert.deepEqual([rows[0].name, rows[0].username], ['Alice Smith', 'alice'])
	assert.equal(rows[2].name, 'Known')
	assert.equal(db.getUser(1).name, 'Alice Smith')
	const asked = named('getChat').length
	await profiles.fillNames([{ user_id: 3, name: null, username: null }])
	assert.equal(named('getChat').length, asked)
})

test('avatars are cached on disk', async () => {
	const { profiles } = setup()
	const path = await profiles.avatar(1)
	assert.equal(readFileSync(path!, 'utf8'), 'jpeg')
	assert.equal(await profiles.avatar(2), null)
	assert.ok(existsSync(join(profiles.dir, '2.none')))
})

class FakeOpenRouter extends OpenRouter {
	constructor() {
		super('https://openrouter.ai/api/v1', 'key')
	}
	override async fetch() {
		return { balance: 7.93 }
	}
}

async function client() {
	const s = setup()
	const server = createServer(makeHandler(s.db, s.settings, new FakeOpenRouter(), s.profiles))
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	after(() => server.close())
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
	const auth = (user = ADMIN) => ({ Authorization: `tma ${signed(user, Date.now() / 1000)}` })
	const get = (path: string, headers = {}) => fetch(base + path, { headers })
	const post = (path: string, headers = {}) => fetch(base + path, { method: 'POST', headers })
	return { ...s, get, post, auth }
}

test('the API needs a signature, and an admin behind it', async () => {
	const { get, auth } = await client()
	assert.equal((await get('/admin/api/stats')).status, 401)
	assert.equal((await get('/admin/api/stats', auth(8))).status, 403)
})

test('an admin gets the dashboard', async () => {
	const { get, auth } = await client()
	const r = await get('/admin/api/stats', auth())
	assert.equal(r.status, 200)
	const data = await r.json()
	assert.deepEqual(data.openrouter, { balance: 7.93 })
	assert.ok('users' in data)
})

test('an avatar needs an admin and a photo', async () => {
	const { get, auth } = await client()
	assert.equal((await get('/admin/api/avatar/1')).status, 401)
	const r = await get('/admin/api/avatar/1', auth())
	assert.equal(r.status, 200)
	assert.equal(await r.text(), 'jpeg')
	assert.equal((await get('/admin/api/avatar/2', auth())).status, 404)
	assert.equal((await get('/admin/api/avatar/x', auth())).status, 404)
})

test('the page is served', async () => {
	const { get } = await client()
	const r = await get('/admin')
	assert.equal(r.status, 200)
	assert.ok((await r.text()).includes('telegram-web-app.js'))
})

test('a bonus adds videos for today and tells the user', async () => {
	const { post, auth, db, named } = await client()
	assert.equal((await post('/admin/api/users/1/bonus')).status, 401)
	assert.equal((await post('/admin/api/users/1/bonus', auth(8))).status, 403)
	let r = await post('/admin/api/users/1/bonus', auth())
	assert.deepEqual([r.status, await r.json()], [200, { limit: 20, notified: true }])
	r = await post('/admin/api/users/1/bonus', auth())
	assert.equal((await r.json()).limit, 30)
	assert.equal(db.bonusToday(1), 20)
	assert.equal(named('sendMessage').length, 2)
	r = await post('/admin/api/users/3/bonus', auth())
	assert.equal((await r.json()).notified, false)
	assert.equal((await post('/admin/api/users/x/bonus', auth())).status, 404)
})
