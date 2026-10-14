// Русская типографика для текстов сайта: короткие слова, числа и тире держатся
// за соседей, чтобы строка не начиналась с тире и не заканчивалась висячим предлогом.
// `typograph` прогоняется по каждой собранной странице в src/frontend/middleware.ts,
// а `typographText` нужен для текста, который острова выводят сами: их пропсы должны
// приходить уже обработанными, иначе браузер отрисует их не так, как сервер.

const NBSP = ' '
// Узкий неразрывный пробел между разрядами, как принято в русском наборе.
const NNBSP = ' '

const PARTICLE = String.raw`(?:ли|же|бы)(?![\p{L}\d])`

// Короткие слова (предлоги, союзы, "я") держатся за следующее слово, трёхбуквенные
// предлоги тоже, так как в конце строки они висят так же заметно. Частицы держатся
// только за предыдущее слово, иначе "можно ли заниматься" склеится в один кусок.
const SHORT = String.raw`(?<![\p{L}\d])(?!${PARTICLE})(?:\p{L}{1,2}|без|для|вне|изо|меж|над|обо|ото|под|при|про)`
const shortInside = new RegExp(String.raw`(${SHORT})\s+(?=\S)`, 'giu')
const shortAtEnd = new RegExp(String.raw`(${SHORT})\s+$`, 'iu')
const particle = new RegExp(String.raw`(?<=[\p{L}\d])\s+(?=${PARTICLE})`, 'giu')
// Сокращение не отрывается от того, что сокращает: "т. е.", "г. Самара".
const abbr = /(?<![\p{L}\d])(т|г|гг|ул|пр|д|кв|см|стр|им|св|тел)\.\s+(?=\S)/giu
// Инициалы держатся друг за друга и за фамилию: "А. С. Пушкин".
const initial = /(?<!\p{L})(\p{Lu}\.)\s+(?=\p{Lu})/gu
const numero = /([№§])\s*(?=\d)/g
// Ни тире, ни разделитель "·" не начинают строку.
const dash = /(?<=\S)\s+(?=[—·])/g
// Число не отрывается от единицы измерения: "20 минут", "2 499 ₽", "5 °C".
const unit = /(?<=\d)\s+(?=[\p{L}₽%°$€])/gu
// Разряды: в "2 499" группа сохраняется, числа от пяти цифр разбиваются,
// "12000" -> "12 000". Четыре цифры не трогаем, потому что обычно это год.
const thousands = /(?<=\d)[  ](?=\d{3}(?!\d))/g
const long = /(?<![\d+.,#])\d{5,}(?![\d.,])/g
// Телефон -- один кусок: правило разрядов покорёжило бы "8 800 200 01 22", поэтому
// его вырезаем первым, а пробелы в нём меняем на неразрывные.
const phone = /(?:\+7|(?<!\d)8)(?:[\s()-]*\d){10}(?!\d)/g

/** Типографика для простого текста, без разметки. */
export function typographText(text: string): string {
	const parts = split(text.replace(/\.{3}/g, '…'), phone)

	return parts
		.map((part, i) => {
			if (i % 2) return part.replace(/\s+/g, NBSP)

			const fixed = words(part)

			// Короткое слово перед телефоном висит так же, как в конце строки.
			return i < parts.length - 1 ? fixed.replace(shortAtEnd, `$1${NBSP}`) : fixed
		})
		.join('')
}

function words(s: string): string {
	return s
		.replace(long, (n) => n.replace(/\B(?=(\d{3})+$)/g, NNBSP))
		.replace(thousands, NNBSP)
		.replace(numero, `$1${NBSP}`)
		.replace(unit, NBSP)
		.replace(dash, NBSP)
		.replace(particle, NBSP)
		.replace(abbr, `$1.${NBSP}`)
		.replace(initial, `$1${NBSP}`)
		.replace(shortInside, `$1${NBSP}`)
}

// Комментарии, теги с атрибутами, а также код и элементы форм, текст которых должен
// остаться байт в байт. `split()` кладёт в результат обе группы, поэтому текстовый
// узел -- каждый третий элемент.
const TOKEN = /(<!--[\s\S]*?-->|<(script|style|pre|code|textarea)\b[\s\S]*?<\/\2>|<[^>]*>)/gi
const INLINE = 'a|abbr|b|del|em|i|mark|q|s|small|span|strong|sub|sup|time|u'
const inlineOpen = new RegExp(String.raw`^<(?:${INLINE})\b`, 'i')
const inlineClose = new RegExp(String.raw`^</(?:${INLINE})\s*>`, 'i')
const leadingDash = /^\s+(?=[—·])/

/** Типографика для HTML-страницы: меняется только текст между тегами. */
export function typograph(html: string): string {
	const parts = html.split(TOKEN)

	for (let i = 0; i < parts.length; i += 3) {
		if (!parts[i]?.trim()) continue

		let text = typographText(parts[i])

		// Предлог перед ссылкой повиснет в конце строки, а ссылка уедет на следующую.
		if (inlineOpen.test(parts[i + 1] ?? '')) text = text.replace(shortAtEnd, `$1${NBSP}`)

		// "<b>Сабля</b> — это": слово перед тире живёт в предыдущем узле. После `<br>`
		// или блока тире открывает строку намеренно, его не трогаем.
		if (i > 0 && inlineClose.test(parts[i - 2])) text = text.replace(leadingDash, NBSP)

		parts[i] = text
	}

	// Имя тега из второй группы не часть страницы.
	return parts.filter((_, i) => i % 3 !== 2).join('')
}

// Как `split()` с группой: чётные элементы -- текст между совпадениями,
// нечётные -- сами совпадения.
function split(s: string, re: RegExp): string[] {
	const out: string[] = []
	let last = 0

	for (const m of s.matchAll(re)) {
		out.push(s.slice(last, m.index), m[0])
		last = m.index + m[0].length
	}

	out.push(s.slice(last))

	return out
}
