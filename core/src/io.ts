const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Shortcut to convert to 2-digit. Mostly used to make the line shorter.
const _2 = (v: number) => v.toString().padStart(2, '0');

/**
 * Get a human-readable string for a date that also fits into CLIs well (fixed-width)
 */
export function prettyDate(date: Date): string {
	return `${date.getFullYear()} ${months[date.getMonth()]} ${_2(date.getDate())} ${_2(date.getHours())}:${_2(date.getMinutes())}:${_2(date.getSeconds())}.${date.getMilliseconds().toString().padStart(3, '0')}`;
}

export let _debugOutput = false;

/**
 * Enable or disable debug output.
 */
export function _setDebugOutput(enabled: boolean) {
	_debugOutput = enabled;
}

// I/O for "progressive" actions

export function start(message: string) {}

export function progress(value: number) {}

export function done() {}

// User-facing messaging

export interface ConsoleLike {
	debug(...args: any[]): void;
	log(...args: any[]): void;
	info(...args: any[]): void;
	warn(...args: any[]): void;
	error(...args: any[]): void;
}

export let output: ConsoleLike = console;

export function useOutput(newOutput: ConsoleLike) {
	output = newOutput;
}

export function debug(...args: any[]) {
	output.debug(...args);
}

export function log(...args: any[]) {
	output.log(...args);
}

export function info(...args: any[]) {
	output.info(...args);
}

export function warn(...args: any[]) {
	output.warn(...args);
}

export function error(...args: any[]) {
	output.error(...args);
}

/**
 * This is a factory for handling errors when performing operations.
 * The handler will allow the parent scope to continue if certain errors occur,
 * rather than fatally exiting.
 */
export function someWarnings(...allowList: [RegExp, string?][]): (error: string | Error) => void {
	return (error: string | Error) => {
		error = typeof error == 'object' && 'message' in error ? error.message : error;
		for (const [pattern, message = error] of allowList) {
			if (!pattern.test(error)) continue;
			warn(message);
			return;
		}
		throw error;
	};
}
