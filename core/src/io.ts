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

export let start: (message: string) => void;
export let progress: (value: number, max: number, message?: any) => void;
export let done: () => void;

export interface ProgressIO {
	start(message: string): void;
	progress(value: number, max: number, message?: any): void;
	done(): void;
}

export function useProgressIO(io: ProgressIO) {
	start = io.start.bind(io);
	progress = io.progress.bind(io);
	done = io.done.bind(io);
}

// User-facing messaging

export let debug: (...args: any[]) => void;
export let log: (...args: any[]) => void;
export let info: (...args: any[]) => void;
export let warn: (...args: any[]) => void;
export let error: (...args: any[]) => void;

export interface ConsoleLike {
	debug(...args: any[]): void;
	log(...args: any[]): void;
	info(...args: any[]): void;
	warn(...args: any[]): void;
	error(...args: any[]): void;
}

export function useOutput(output: ConsoleLike) {
	debug = output.debug.bind(output);
	log = output.log.bind(output);
	info = output.info.bind(output);
	warn = output.warn.bind(output);
	error = output.error.bind(output);
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

/** @hidden @internal for Logzen */
export const constructor = { name: 'Console' };
