import { createInterface } from 'node:readline/promises';
import * as z from 'zod';
import { exit } from 'ioium/node';

const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

export { rl };

export async function rlConfirm(question: string = 'Is this ok'): Promise<void> {
	const { data, error } = z
		.stringbool()
		.default(false)
		.safeParse(await rl.question(question + ' [y/N]: ').catch(() => exit('Aborted.')));
	if (error || !data) exit('Aborted.');
}
