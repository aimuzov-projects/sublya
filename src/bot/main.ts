import { join } from 'node:path'
import { run } from '@grammyjs/runner'
import { Bot, GrammyError } from 'grammy'

import { serve } from '#bot/admin.ts'
import { fromEnv } from '#bot/config.ts'
import { Db } from '#bot/db.ts'
import { handlers } from '#bot/handlers.ts'
import { mirrorIncoming, mirrorOutgoing, Support } from '#bot/support.ts'
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
	// the team's messages in a user's topic go to that user
	bot.chatType(['group', 'supergroup']).on('message', (ctx) => support.reply(ctx.msg))
}
bot.use(handlers({ db, worker, settings, support }))
bot.catch(({ error, ctx }) => console.error(`update ${ctx.update.update_id} failed`, error))

await bot.api.setMyCommands(COMMANDS)
let panel = null
if (settings.adminUrl) {
	panel = await serve(bot.api, db, settings)
	// the button next to the input field opens the panel. Menus are set per chat, so only
	// admins get it; Telegram refuses for someone who never wrote to the bot
	const button = { type: 'web_app' as const, text: texts.BTN_ADMIN, web_app: { url: settings.adminUrl } }
	for (const admin of settings.adminIds) {
		await bot.api.setChatMenuButton({ chat_id: admin, menu_button: button }).catch((e) => {
			if (!(e instanceof GrammyError)) throw e
			console.warn(`no admin menu button for ${admin}`)
		})
	}
}

const stop = new AbortController()
const background = [worker.run(stop.signal), cleanupLoop(settings, stop.signal)].map((task) =>
	task.catch((e) => {
		console.error('background task died', e)
		process.exit(1)
	}),
)
// updates are handled concurrently, as in aiogram: a download must not hold up everyone else
const runner = run(bot)
console.info('polling')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, async () => {
		await runner.stop()
		stop.abort()
		await Promise.all(background)
		panel?.close()
		db.close()
	})
}
