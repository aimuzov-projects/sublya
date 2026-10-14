export default {
	extends: ['@aimuzov-projects/infra-site-kit/stylelint'],
	// The site came from sublya/site before BEM: these sheets still style tags inside blocks.
	overrides: [
		{
			files: ['src/frontend/styles/{features,final,stage,steps}.css'],
			rules: { 'selector-max-type': null },
		},
	],
}
