// This file only exists to make Svelte shut up in components

export default {
	compilerOptions: {
		runes: true,
		warningFilter(w) {
			if (w.code.startsWith('a11y')) return false;
		},
		experimental: {
			async: true,
		},
	},
	vitePlugin: {
		// Fixes a problem where Vite does something that results in the virtual CSS file just being the entire svelte component, which is obviously invalid CSS.
		emitCss: false,
	},
};
