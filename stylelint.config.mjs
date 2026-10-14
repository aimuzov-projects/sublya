import stylelint from 'stylelint'
import { propertyGroups } from 'stylelint-config-clean-order'
import order from 'stylelint-order'

// Только BEM: имена классов по схеме block__elem--mod и никаких тегов внутри блоков.
const name = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*'
const mod = '[a-z0-9]+(?:-[a-z0-9]+)*'
const bem = new RegExp(`^${name}(?:__${name})?(?:--${mod})?$`)

// Встроенный selector-class-pattern не видит склейку &__elem: селектор без точки он пропускает,
// а resolveNestedSelectors из Stylelint 17 убрали. Склеиваем & с родителем, как postcss-nested.
const ruleName = 'local/bem-class'
const messages = stylelint.utils.ruleMessages(ruleName, {
	rejected: (cls) => `Класс ".${cls}" не по BEM: block__elem--mod`,
})

const resolve = (rule) => {
	let parent = rule.parent
	while (parent && parent.type !== 'rule' && parent.type !== 'root') parent = parent.parent
	if (!parent || parent.type === 'root') return rule.selectors
	return resolve(parent).flatMap((p) =>
		rule.selectors.map((s) => (s.includes('&') ? s.replaceAll('&', p) : `${p} ${s}`)),
	)
}

const bemClass = stylelint.createPlugin(ruleName, (on) => (root, result) => {
	if (!on) return
	root.walkRules((rule) => {
		if (rule.parent?.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return
		const seen = new Set()
		for (const selector of resolve(rule))
			for (const [, cls] of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
				if (bem.test(cls) || seen.has(cls)) continue
				seen.add(cls)
				stylelint.utils.report({ result, ruleName, node: rule, message: messages.rejected(cls) })
			}
	})
})

export default {
	customSyntax: 'postcss-html',
	plugins: [bemClass, order],
	rules: {
		[ruleName]: true,
		// Блок читается сверху вниз: свои свойства, его адаптив, потом элементы.
		'order/order': ['custom-properties', 'declarations', { type: 'at-rule', name: 'media' }, 'rules'],
		// Группы clean-order (позиция, раскладка, размеры, текст, вид, анимации), но без пустых строк между ними.
		'order/properties-order': [propertyGroups.map((properties) => ({ properties })), { unspecified: 'bottom' }],
		'selector-max-type': [
			0,
			{ ignoreTypes: ['html', 'body'], message: 'Тег внутри блока: дайте элементу класс block__elem' },
		],
	},
	overrides: [
		{ files: ['**/*.css'], customSyntax: null },
		// Базовые стили тегов живут здесь, это не элементы блоков.
		{ files: ['src/frontend/styles/base.css'], rules: { 'selector-max-type': null } },
		// Сайт пришёл из sublya/site до BEM: часть разметки строят скрипты, и теги внутри
		// блоков уйдут вместе с переводом их на классы.
		{
			files: ['src/frontend/styles/{features,final,stage,steps}.css'],
			rules: { 'selector-max-type': null },
		},
	],
}
