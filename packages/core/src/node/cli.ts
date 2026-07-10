import { exit } from 'ioium/node';
import { createInterface } from 'node:readline/promises';
import * as z from 'zod';

const rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

export { rl };

export async function rlConfirm(question: string = 'Is this ok'): Promise<boolean> {
	const raw = await rl.question(question + ' [y/N]: ').catch(() => false);

	if (raw === false) return false;

	const { data, error } = z.stringbool().default(false).safeParse(raw);

	return !!error || data;
}

export async function assertYes(question?: string | null, assumeYes: boolean = false, failureMessage: string = 'Aborted.'): Promise<void> {
	if (assumeYes) return;

	const yes = await rlConfirm(question || 'Is this ok');

	if (!yes) exit(failureMessage);
}
