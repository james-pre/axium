import * as z from 'zod';
import * as tools from '../tools.js';

function requireSandbox(context: tools.Context): tools.Sandbox {
	if (!context.sandbox) throw new Error('The sandbox is not available');
	return context.sandbox;
}

/** Characters of each output stream given to the model */
const maxStreamLength = 12_000;

/** Keeps the start and end of long output, where errors and results usually are */
function shorten(text: string): string {
	if (text.length <= maxStreamLength) return text;
	const half = maxStreamLength / 2;
	return `${text.slice(0, half)}\n[... ${text.length - maxStreamLength} characters left out ...]\n${text.slice(-half)}`;
}

tools.add({
	name: 'run_command',
	description:
		"Runs a bash script in this conversation's sandbox, an isolated Linux virtual machine with Python 3 and common data packages (see `pip list`). " +
		'It starts in /work, where files last for the rest of the conversation, including files the user attaches (listed in an <attachments> tag on their message). ' +
		'Anything outside /work, and any process, ends with the command; Package managers should install new packages under /work. ' +
		'Commands run as an unprivileged user and the system is read-only, so sudo and apt-get do not work: ' +
		'prefer packages that bundle their native libraries, such as opencv-python-headless instead of opencv-python. ' +
		'If a download is refused, tell the user they can change internet access in their AI preferences instead of retrying. ' +
		'Use it to inspect, extract, convert or analyze files, and for calculations that must be exact.',
	environment: 'sandbox',
	access: 'write',
	approval: 'allow',
	input: z.object({
		command: z.string().min(1).max(100_000).describe('A bash script'),
		timeout: z.int().min(1).max(3600).optional().describe('Seconds before the command is stopped; defaults to the most allowed'),
	}),
	async run({ command, timeout }, context) {
		const result = await requireSandbox(context).run(command, { timeout, signal: context.signal });
		return {
			exit_code: result.exitCode,
			...(result.timedOut && { timed_out: true }),
			stdout: shorten(result.stdout),
			stderr: shorten(result.stderr),
		};
	},
});

tools.add({
	name: 'write_file',
	description: 'Writes a text file in the sandbox, replacing it if it exists. Folders are created as needed.',
	environment: 'sandbox',
	access: 'write',
	approval: 'allow',
	input: z.object({
		path: z.string().min(1).max(1024).describe('Relative to /work, or absolute'),
		content: z.string().max(1_000_000),
	}),
	async run({ path, content }, context) {
		const data = new TextEncoder().encode(content);
		await requireSandbox(context).write(path, data, context.signal);
		return { path, size: data.length };
	},
});

/** Characters of a file given to the model at once */
const partSize = 20_000;

tools.add({
	name: 'read_file',
	description:
		'Reads a text file from the sandbox. Long files are returned in parts: when a result has `next`, call again with it as `offset` to read further. ' +
		'Use run_command to inspect other kinds of files.',
	environment: 'sandbox',
	access: 'read',
	input: z.object({
		path: z.string().min(1).max(1024).describe('Relative to /work, or absolute'),
		offset: z.int().nonnegative().optional().describe('Where to continue reading, from `next` in an earlier result'),
	}),
	async run({ path, offset = 0 }, context) {
		const data = await requireSandbox(context).read(path, context.signal);

		let text: string;
		try {
			text = new TextDecoder('utf-8', { fatal: true }).decode(data);
		} catch {
			throw new Error('This is not a text file; use run_command to inspect it');
		}

		const part = text.slice(offset, offset + partSize);
		const end = offset + part.length;
		return { path, text: part, ...(end < text.length && { next: end, length: text.length }) };
	},
});
