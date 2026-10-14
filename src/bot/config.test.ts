import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fromEnv } from '#bot/config.ts'

const base = { BOT_TOKEN: '1:t', STT_API_KEY: 'k' }

test('numbers and ids come from the environment', () => {
	const s = fromEnv({ ...base, ADMIN_IDS: '1, 2 3', SUPPORT_CHAT_ID: '-1001', DAILY_VIDEOS: '5', STT_LAG: '0.1' })

	assert.deepEqual([...s.adminIds], [1, 2, 3])
	assert.equal(s.supportChatId, -1001)
	assert.equal(s.dailyVideos, 5)
	assert.equal(s.sttLag, 0.1)
})

test('a typo stops the start instead of turning into NaN', () => {
	assert.throws(() => fromEnv({ ...base, ADMIN_IDS: '123;456' }), /ADMIN_IDS/)
	assert.throws(() => fromEnv({ ...base, SUPPORT_CHAT_ID: '-100x' }), /SUPPORT_CHAT_ID/)
	assert.throws(() => fromEnv({ ...base, STT_DAILY_MINUTES: 'lots' }), /STT_DAILY_MINUTES/)
})

test('an empty DEFAULT_LANG means autodetect', () => {
	assert.equal(fromEnv({ ...base, DEFAULT_LANG: '' }).defaultLang, null)
	assert.equal(fromEnv(base).defaultLang, 'ru')
})
