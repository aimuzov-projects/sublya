import { join } from 'node:path'
import { run } from '@grammyjs/runner'
import { Bot } from 'grammy'

import { serve } from '#bot/admin.ts'
import { fromEnv } from '#bot/config.ts'
import { Db } from '#bot/db.ts'
import { handlers } from '#bot/handlers.ts'
import { isTelegramError, mirrorIncoming, mirrorOutgoing, Support } from '#bot/support.ts'
import * as texts from '#bot/texts.ts'
import { cleanupLoop, Worker } from '#bot/worker.ts'

const COMMANDS = [
	{ command: 'start', description: 'Как пользоваться' },
	{ command: 'style', description: 'Стиль по умолчанию' },
	{ command: 'lang', description: 'Язык речи' },
]

const settings = fromEnv()
const bot = new Bot(settings.botToken, settings.apiUrl ? { client: { apiRoot: settings.apiUrl } } : {})
const db = new Db(join(settings.dataDir, 'sublya.db'))
const worker = new Worker(bot.api, db, settings)
const support = new Support(bot.api, db, settings.supportChatId)

if (support.enabled) {
	bot.api.config.use(mirrorOutgoing(support))
	bot.use(mirrorIncoming(support))
	// Сообщения команды в теме пользователя уходят этому пользователю.
	bot.chatType(['group', 'supergroup']).on('message', (ctx) => support.reply(ctx.msg))
}

bot.use(handlers({ db, worker, settings, support }))
bot.catch(({ error, ctx }) => console.error(`update ${ctx.update.update_id} failed`, error))

await bot.api.setMyCommands(COMMANDS)
let panel = null

if (settings.adminUrl) {
	panel = await serve(bot.api, db, settings)
	// Кнопка рядом с полем ввода открывает админку. Меню задаётся для каждого чата, поэтому
	// она есть только у админов. Тому, кто ни разу не писал боту, Telegram её поставить не даст.
	const button = { type: 'web_app' as const, text: texts.BTN_ADMIN, web_app: { url: settings.adminUrl } }

	for (const admin of settings.adminIds) {
		await bot.api.setChatMenuButton({ chat_id: admin, menu_button: button }).catch((e) => {
			if (!isTelegramError(e)) throw e

			console.warn(`no admin menu button for ${admin}`)
		})
	}
}

const stop = new AbortController()

void [worker.run(stop.signal), cleanupLoop(settings, stop.signal)].map((task) =>
	task.catch((e) => {
		console.error('background task died', e)
		process.exit(1)
	}),
)

// Апдейты обрабатываются параллельно, как в aiogram:
// скачивание видео не должно задерживать остальных.
const runner = run(bot)

console.info('polling')

// Docker убивает контейнер через 10 с после SIGTERM, а рендер идёт дольше: задача остаётся
// в `running`, и `requeueRunning()` вернёт её в очередь при следующем старте.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, async () => {
		stop.abort()
		await runner.stop()
		panel?.close()
		db.close()
		process.exit(0)
	})
}
