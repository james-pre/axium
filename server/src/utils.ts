import chalk from 'chalk';

/** Convenience function for `example... [Done. / error]` */
export async function report<T>(promise: Promise<T>, message: string, success: string = 'done.'): Promise<T> {
	process.stdout.write(message + '... ');

	try {
		const result = await promise;
		console.log(success);
		return result;
	} catch (error: any) {
		throw typeof error == 'object' && 'message' in error ? error.message : error;
	}
}

export function err(message: string | Error): void {
	if (message instanceof Error) message = message.message;
	console.error(message.startsWith('\x1b') ? message : chalk.red(message));
}

/** Yet another convenience function */
export function exit(message: string | Error, code: number = 1): never {
	err(message);
	process.exit(code);
}
