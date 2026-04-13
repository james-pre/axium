// Note this is ONLY used at development time to make Svelte shut up about various warnings

export default {
	compilerOptions: {
		runes: true,
		warningFilter(w) {
			return !w.code.startsWith('a11y') && w.code != 'state_referenced_locally';
		},
		experimental: {
			async: true,
		},
	},
};
