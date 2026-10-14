import stylelint from 'stylelint'
import { propertyGroups } from 'stylelint-config-clean-order'
import order from 'stylelint-order'

// BEM only: class names follow block__elem--mod and no tags inside blocks.
const name = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*'
const mod = '[a-z0-9]+(?:-[a-z0-9]+)*'
const bem = new RegExp(`^${name}(?:__${name})?(?:--${mod})?$`)

// The built-in selector-class-pattern doesn't see &__elem (it skips selectors
// without a dot), and Stylelint 17 dropped resolveNestedSelectors.
// So we join & with the parent ourselves, like postcss-nested does.
const ruleName = 'local/bem-class'
const messages = stylelint.utils.ruleMessages(ruleName, {
	rejected: (cls) => `Class ".${cls}" is not BEM: block__elem--mod`,
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
		// A block reads top to bottom: own properties, its @media rules, then its elements.
		'order/order': ['custom-properties', 'declarations', { type: 'at-rule', name: 'media' }, 'rules'],
		// clean-order groups (position, layout, size, text, look, animation),
		// but without empty lines between them.
		'order/properties-order': [propertyGroups.map((properties) => ({ properties })), { unspecified: 'bottom' }],
		'selector-max-type': [
			0,
			{ ignoreTypes: ['html', 'body'], message: 'Tag inside a block: give the element a block__elem class' },
		],
	},
	overrides: [
		{ files: ['**/*.css'], customSyntax: null },
		// Base tag styles live here, they aren't block elements.
		{ files: ['src/frontend/styles/global.css'], rules: { 'selector-max-type': null } },
		// The site came from sublya/site before BEM: these sheets still style tags inside blocks.
		{
			files: ['src/frontend/styles/{features,final,stage,steps}.css'],
			rules: { 'selector-max-type': null },
		},
	],
}
