import assert from 'node:assert/strict'
import { test } from 'node:test'

import { typograph, typographText } from '#shared/typograph.ts'

// В ожиданиях "_" -- неразрывный пробел, а "^" -- узкий, чтобы их было видно.
const show = (s: string) => s.replaceAll(' ', '_').replaceAll(' ', '^')
const t = (text: string) => show(typographText(text))
const h = (html: string) => show(typograph(html))

test('short words hold on to the next one, chains included', () => {
	assert.equal(t('Сегодня мы ездили в Самару за рыбой'), 'Сегодня мы_ездили в_Самару за_рыбой')
	assert.equal(t('и в доме, для всех'), 'и_в_доме, для_всех')
})

test('particles hold on to the previous word only', () => {
	assert.equal(t('Можно ли заниматься'), 'Можно_ли заниматься')
	assert.equal(t('Пришла бы ли она'), 'Пришла_бы_ли она')
})

test('numbers: units, digit groups, years', () => {
	assert.equal(t('Стоит 2 499 ₽ за 60 минут'), 'Стоит 2^499_₽ за_60_минут')
	assert.equal(t('Было 12000 человек в 2024 году'), 'Было 12^000_человек в_2024_году')
	assert.equal(t('4 стиля'), '4_стиля')
})

test('a phone number stays whole', () => {
	assert.equal(t('Звонок на 8 800 200 01 22'), 'Звонок на_8_800_200_01_22')
	assert.equal(t('Звоните +7 (900) 123-45-67 днём'), 'Звоните +7_(900)_123-45-67 днём')
})

test('dash, separator, abbreviations, ellipsis', () => {
	assert.equal(t('Распознавание ошибается — это заметно'), 'Распознавание ошибается_— это заметно')
	assert.equal(t('Сабля · код'), 'Сабля_· код')
	assert.equal(t('т. е. всё, А. С. Пушкин'), 'т._е. всё, А._С._Пушкин')
	assert.equal(t('Ну... ладно'), 'Ну… ладно')
})

test('typography is idempotent', () => {
	const once = typographText('Пришли видео в Telegram — бот вернёт его за 12000 секунд')

	assert.equal(typographText(once), once)
})

test('HTML: only the text between tags changes', () => {
	assert.equal(
		h('<p title="в доме">в доме</p><script>const a = "в доме"</script>'),
		'<p title="в доме">в_доме</p><script>const a = "в доме"</script>',
	)

	assert.equal(
		h('<style>a { margin: 0 в }</style><!-- в доме -->'),
		'<style>a { margin: 0 в }</style><!-- в доме -->',
	)

	assert.equal(h('<code>в доме</code><textarea>и я</textarea>'), '<code>в доме</code><textarea>и я</textarea>')
})

test('HTML: a short word before an inline tag holds on, before a block it does not', () => {
	assert.equal(h('<p>код на <a href="/">GitHub</a></p>'), '<p>код на_<a href="/">GitHub</a></p>')
	assert.equal(h('<p>Сделано с ❤️ <a href="/">aimuzov</a></p>'), '<p>Сделано с_❤️ <a href="/">aimuzov</a></p>')
	assert.equal(h('<li>и в </li><li>доме</li>'), '<li>и_в </li><li>доме</li>')
})

test('HTML: a dash after a closing inline tag holds on, after <br> it opens the line', () => {
	assert.equal(h('<p><strong>Сабля</strong> — это бот</p>'), '<p><strong>Сабля</strong>_— это бот</p>')
	assert.equal(h('<p><a href="/">код</a> · видео</p>'), '<p><a href="/">код</a>_· видео</p>')
	assert.equal(h('<p>Привет<br>— Привет</p>'), '<p>Привет<br>— Привет</p>')
	assert.equal(h('<p>\n\t— Привет</p>'), '<p>\n\t— Привет</p>')
})
