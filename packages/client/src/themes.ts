import type { Theme } from '@axium/core/preferences';

export const themeStyles: Record<Theme, Record<string, string>> = Object.assign(Object.create(null), {
	light: {
		'fg-light': '10%',
		'bg-light': '70%',
		'light-step': '-6%',
	},
	forest: {
		hue: '150',
		'fg-light': '75%',
		'bg-light': '20%',
	},
	midnight: {
		'fg-light': '60%',
		'bg-light': '2.5%',
		'light-step': '2.5%',
	},
	beach: {
		hue: '50',
		'fg-light': '30%',
		'bg-light': '60%',
		'light-step': '-4%',
	},
	cherry: {
		hue: '330',
		'fg-light': '80%',
		'bg-light': '20%',
	},
	volcano: {
		hue: '10',
		'fg-light': '80%',
		'bg-light': '10%',
		'light-step': '5%',
	},
});
