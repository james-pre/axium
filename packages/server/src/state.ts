// eslint-disable-next-line no-shadow-restricted-names
declare const globalThis: { [sym]?: string };

const sym = Symbol.for('Axium:state');

if (globalThis[sym])
	throw new Error(
		`Duplicate Axium server state! You might have multiple instances of the same module loaded (${globalThis[sym]} and ${import.meta.url}).`
	);

globalThis[sym] = import.meta.url;
