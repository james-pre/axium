#!/usr/bin/env node
import { Option, program } from 'commander';
import { styleText } from 'node:util';
import $pkg from './package.json' with { type: 'json' };

program.version($pkg.version).name('axium-client').description('Axium client CLI');

// Options shared by multiple commands
const opts = {
	force: new Option('-f, --force', 'force the operation').default(false),
	verbose: new Option('-v, --verbose', 'verbose output').default(false),
};

interface Opts {
	'auth login': {
		verbose: boolean;
	};

	'auth logout': {
		verbose: boolean;
	};

	'auth register': {
		verbose: boolean;
	};

	'auth status': {
		verbose: boolean;
	};
}

const auth = program.command('auth').description('manage authentication');

/** Convenience function for `example... [Done. / error]` */
async function report<T>(promise: Promise<T>, message: string, success: string = 'done.'): Promise<T> {
	process.stdout.write(message + '... ');

	try {
		const result = await promise;
		console.log(success);
		return result;
	} catch (error: any) {
		throw typeof error == 'object' && 'message' in error ? error.message : error;
	}
}

function err(message: string | Error): void {
	if (message instanceof Error) message = message.message;
	console.error(message.startsWith('\x1b') ? message : styleText('red', message));
}

/** Yet another convenience function */
function exit(message: string | Error, code: number = 1): never {
	err(message);
	process.exit(code);
}

auth.command('login')
	.description('login to an Axium server')
	.action(async (opts: Opts['auth login']) => {});

program.parse();
