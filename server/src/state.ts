import { styleText } from 'node:util';

interface UniqueState<T> {
	value: T;
	stack: string;
}

declare const globalThis: {
	[sym]: Record<string, UniqueState<any>> & { _errored: boolean };
};

const sym = Symbol.for('Axium:state');
globalThis[sym] ||= Object.create({ _errored: false });

const { SHOW_DUPLICATE_STATE } = process.env;
let _doWarnings: boolean = SHOW_DUPLICATE_STATE ? ['1', 'true', 'y', 'yes'].includes(SHOW_DUPLICATE_STATE.toLowerCase()) : false;

export function _duplicateStateWarnings(value: boolean) {
	_doWarnings = value;
}

/**
 * Prevent duplicate shared state.
 */
export function _unique<T>(id: string, value: T): T {
	const state = globalThis[sym];

	const _err = new Error();
	Error.captureStackTrace(_err, _unique);
	const stack = _err.stack!.slice(6);

	if (!(id in state)) {
		state[id] = { value, stack };
		return value;
	}

	if (!state._errored) {
		console.error(styleText('red', 'Duplicate Axium server state! You might have multiple instances of the same module loaded.'));
		state._errored = true;
	}

	_doWarnings && console.warn(styleText('yellow', `Mitigating duplicate state! (${id})\n${stack}\nFrom original\n${state[id].stack}`));

	return state[id].value;
}
