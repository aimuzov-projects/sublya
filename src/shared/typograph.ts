// Russian typography for the site's text: short words, numbers and dashes keep to their
// neighbours so a line never starts with a dash or ends with a dangling preposition.
// `typograph` runs over every built page in src/frontend/middleware.ts; `typographText` is
// for text the islands print themselves: their props have to arrive already set, or the
// browser would render them differently from the server.

const NBSP = ' '
// thin no-break space between digit groups, as Russian sets them
const NNBSP = ' '

const PARTICLE = String.raw`(?:ли|же|бы)(?![\p{L}\d])`

// Short words (prepositions, conjunctions, "я") hold on to the next word, and so do
// the three-letter prepositions, which dangle at a line end just as visibly. Particles hold
// on to the previous word only, otherwise "можно ли заниматься" would become one piece.
const SHORT = String.raw`(?<![\p{L}\d])(?!${PARTICLE})(?:\p{L}{1,2}|без|для|вне|изо|меж|над|обо|ото|под|при|про)`
const shortInside = new RegExp(String.raw`(${SHORT})\s+(?=\S)`, 'giu')
const shortAtEnd = new RegExp(String.raw`(${SHORT})\s+$`, 'iu')
const particle = new RegExp(String.raw`(?<=[\p{L}\d])\s+(?=${PARTICLE})`, 'giu')
// an abbreviation stays with what it abbreviates: "т. е.", "г. Самара"
const abbr = /(?<![\p{L}\d])(т|г|гг|ул|пр|д|кв|см|стр|им|св|тел)\.\s+(?=\S)/giu
// initials stay with each other and with the surname: "А. С. Пушкин"
const initial = /(?<!\p{L})(\p{Lu}\.)\s+(?=\p{Lu})/gu
const numero = /([№§])\s*(?=\d)/g
// neither a dash nor a "·" separator starts a line
const dash = /(?<=\S)\s+(?=[—·])/g
// a number stays with its unit: "20 минут", "2 499 ₽", "5 °C"
const unit = /(?<=\d)\s+(?=[\p{L}₽%°$€])/gu
// Digit groups: "2 499" keeps its group, numbers of five digits and more get split,
// "12000" -> "12 000". Four digits stay as they are: that's usually a year.
const thousands = /(?<=\d)[  ](?=\d{3}(?!\d))/g
const long = /(?<![\d+.,#])\d{5,}(?![\d.,])/g
// A phone number is one piece: the group rule would mangle "8 800 200 01 22", so it's cut
// out first and its spaces turn into no-break ones.
const phone = /(?:\+7|(?<!\d)8)(?:[\s()-]*\d){10}(?!\d)/g

/** Typography for plain text, without markup. */
export function typographText(text: string): string {
	const parts = split(text.replace(/\.{3}/g, '…'), phone)
	return parts
		.map((part, i) => {
			if (i % 2) return part.replace(/\s+/g, NBSP)
			const fixed = words(part)
			// a short word before a phone number dangles just as at a line end
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

// Comments, tags with their attributes, and the code and form elements whose text must stay
// byte for byte. split() puts both groups into the result, so a text node is every third item.
const TOKEN = /(<!--[\s\S]*?-->|<(script|style|pre|code|textarea)\b[\s\S]*?<\/\2>|<[^>]*>)/gi
const INLINE = 'a|abbr|b|del|em|i|mark|q|s|small|span|strong|sub|sup|time|u'
const inlineOpen = new RegExp(String.raw`^<(?:${INLINE})\b`, 'i')
const inlineClose = new RegExp(String.raw`^</(?:${INLINE})\s*>`, 'i')
const leadingDash = /^\s+(?=[—·])/

/** Typography for an HTML page: only the text between tags changes. */
export function typograph(html: string): string {
	const parts = html.split(TOKEN)
	for (let i = 0; i < parts.length; i += 3) {
		if (!parts[i]?.trim()) continue
		let text = typographText(parts[i])
		// a preposition before a link would dangle at the line end, the link going to the next
		if (inlineOpen.test(parts[i + 1] ?? '')) text = text.replace(shortAtEnd, `$1${NBSP}`)
		// "<b>Сабля</b> — это": the word before the dash lives in the previous node; after
		// a <br> or a block the dash opens a line on purpose and stays
		if (i > 0 && inlineClose.test(parts[i - 2])) text = text.replace(leadingDash, NBSP)
		parts[i] = text
	}
	// the tag name from the second group isn't part of the page
	return parts.filter((_, i) => i % 3 !== 2).join('')
}

// Like split() with a group: even items are the text between matches, odd ones the matches.
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
