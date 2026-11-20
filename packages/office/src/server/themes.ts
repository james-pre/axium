// The document server's Axium themes, one per Axium theme.
import { themeStyles } from '@axium/client/themes';
import { hslToHex } from 'utilium/color';

/** The defaults in `@axium/client/assets/theme.css`, which the `default` theme uses */
const defaults: Record<string, string> = {
	'color-scheme': 'dark',
	hue: '240',
	'fg-light': '73%',
	'bg-light': '13.3%',
	'light-step': '6.6%',
};

/** `saturation` and `lightness` are percentages, `hue` is in degrees */
function hex(hue: number, saturation: number, lightness: number): string {
	const fraction = (value: number) => Math.min(100, Math.max(0, value)) / 100;
	return '#' + hslToHex(hue / 360, fraction(saturation), fraction(lightness));
}

/** Axium's colors, using the formulas in `theme.css` */
function axiumColors(style: Record<string, string>): Record<string, string> {
	const hue = parseFloat(style.hue);
	const foreground = parseFloat(style['fg-light']);
	const background = parseFloat(style['bg-light']);
	const step = parseFloat(style['light-step']);

	return {
		'bg-normal': hex(0, 0, background),
		'bg-menu': hex(0, 0, background - step),
		'bg-accent': hex(hue, 15, background + step * 2),
		'bg-alt': hex(hue, 5, background + step),
		'bg-strong': hex(hue, 20, background + step),
		'fg-normal': hex(0, 0, foreground),
		'fg-accent': hex(hue, 15, foreground),
		'fg-disabled': hex(0, 0, foreground - step),
		'border-accent': hex(hue, 10, background + step * 3),
		'border-strong': hex(hue, 20, background + step * 3),
	};
}

const perEditor = (token: string) => ['document', 'spreadsheet', 'presentation', 'pdf', 'visio'].map(editor => `${token}-${editor}`);

/**
 * Editor color tokens by the Axium color they take.
 * The base theme keeps status colors (alt key hints, badges, form filling, sheet views, red and green icons), overlays, shadows,
 * the spreadsheet's fixed header shades and the page itself.
 */
function editorColors(axium: Record<string, string>): Record<string, string> {
	const mapping: Record<string, string[]> = {
		'bg-normal': [
			...perEditor('toolbar-header'),
			...perEditor('text-toolbar-header-on-background'),
			'background-normal',
			'background-toolbar',
			'background-toolbar-tab',
			'border-toolbar-active-panel-top',
			'canvas-ruler-background',
			'canvas-cell-title-background',
			'slider-thumb-border-normal',
			'text-inverse',
		],
		'bg-menu': ['background-pane', 'background-contrast-popover', 'canvas-background'],
		'bg-alt': [
			'background-toolbar-additional',
			'canvas-ruler-margins-background',
			'canvas-cell-title-background-hover',
			'canvas-scroll-thumb',
			'highlight-comment-hover',
			'highlight-category-button-hover',
		],
		'bg-strong': [
			'background-notification-popover',
			'highlight-button-pressed',
			'highlight-header-button-pressed',
			'highlight-comment-pressed',
			'highlight-category-button-pressed',
			'highlight-primary-dialog-button-pressed',
		],
		'bg-accent': [
			'eo-app-accent',
			'highlight-button-hover',
			'highlight-button-pressed-hover',
			'highlight-header-button-hover',
			'chb-background-normal-hover',
			'chb-background-checked-hover',
			'rb-background-normal-hover',
			'rb-background-checked-hover',
			'canvas-cell-title-background-selected',
			'canvas-scroll-thumb-hover',
			'canvas-scroll-thumb-pressed',
			'icon-blue-secondary',
		],
		'border-accent': [
			'border-toolbar',
			'border-divider',
			'border-color-shading',
			'border-contrast-popover',
			'canvas-ruler-border',
			'canvas-ruler-handle-border-disabled',
			'canvas-cell-title-border',
			'canvas-scroll-thumb-border',
			'slider-track-background-normal',
		],
		'border-strong': [
			'border-regular-control',
			'border-preview-hover',
			'chb-border-normal',
			'chb-border-checked',
			'rb-border-normal',
			'rb-border-checked',
			'canvas-cell-title-border-hover',
			'canvas-high-contrast-disabled',
			'canvas-scroll-thumb-border-hover',
		],
		'fg-normal': [
			'text-normal',
			'text-normal-pressed',
			'text-toolbar-header',
			'text-link-hover',
			'text-link-active',
			'icon-normal',
			'icon-normal-pressed',
			'icon-toolbar-header',
			'icon-gray-primary',
			'canvas-high-contrast',
			'canvas-scroll-arrow',
			'canvas-scroll-arrow-hover',
			'canvas-scroll-arrow-pressed',
			'canvas-scroll-thumb-target',
			'canvas-scroll-thumb-target-hover',
			'canvas-scroll-thumb-target-pressed',
			'highlight-primary-dialog-button-hover',
			'slider-thumb-background-hover',
		],
		'fg-accent': [
			...perEditor('highlight-header-tab-underline'),
			...perEditor('highlight-toolbar-tab-underline'),
			'text-secondary',
			'text-link',
			'text-link-visited',
			'icon-gray-secondary',
			'icon-blue-primary',
			'canvas-cell-title-text',
			'background-primary-dialog-button',
			'background-accent-button',
			'highlight-text-select',
			'border-preview-select',
			'border-control-focus',
			'border-button-pressed-focus',
			'border-fill-input-focused',
			'chb-border-normal-focus',
			'chb-border-checked-focus',
			'rb-border-normal-focus',
			'rb-border-checked-focus',
			'slider-track-background-filled',
			'slider-thumb-background-normal',
			'slider-thumb-background-active',
		],
		'fg-disabled': [
			'text-tertiary',
			'chb-border-normal-hover',
			'chb-border-checked-hover',
			'rb-border-normal-hover',
			'rb-border-checked-hover',
			'canvas-ruler-mark',
			'canvas-ruler-handle-border',
			'canvas-cell-title-border-selected',
			'canvas-scroll-thumb-border-pressed',
		],
	};

	return Object.fromEntries(Object.entries(mapping).flatMap(([color, tokens]) => tokens.map(token => [token, axium[color]])));
}

export interface EditorTheme {
	id: string;
	name: string;
	type: 'dark' | 'light';
	/** The built-in theme that supplies every color not set here */
	base: string;
	colors: Record<string, string>;
}

export function editorThemes(): EditorTheme[] {
	return [['default', {}] as const, ...Object.entries(themeStyles)].map(([name, overrides]) => {
		const style = { ...defaults, ...overrides };
		const type = style['color-scheme'] == 'light' ? 'light' : 'dark';

		return {
			id: `theme-axium-${name}`,
			name: name == 'default' ? 'Axium' : `Axium ${name}`,
			type,
			base: type == 'dark' ? 'theme-night' : 'theme-white',
			colors: editorColors(axiumColors(style)),
		};
	});
}
