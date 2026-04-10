import { Command, CommanderError } from 'commander';
import * as io from 'ioium/node';
import { createInterface, type Interface } from 'node:readline/promises';
import { styleText } from 'node:util';
import { splitIntoArgs } from 'utilium/shell';
import { getDirectory, remotePWD, setRemotePWD } from '../local.js';
import * as commands from './commands.js';

let readline: Interface;

const promptChar = '$';

function promptText(): string {
	return styleText('green', remotePWD) + promptChar + ' ';
}

const shell = new Command(promptChar).exitOverride();

shell.addCommand(commands.ls).addCommand(commands.mkdir).addCommand(commands.remove);

shell
	.command('cd')
	.description('Change the current remote directory')
	.argument('<path>', 'remote directory path to change to')
	.action(async path => {
		await setRemotePWD(path);
		readline.setPrompt(promptText());
	});

shell
	.command('pwd')
	.description('Print the current remote directory')
	.action(() => console.log(remotePWD));

shell
	.command('exit')
	.alias('quit')
	.description('Exit the shell')
	.action(() => process.exit(0));

export default async function filesShell() {
	readline = createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: promptText(),
		async completer(line) {
			const args = splitIntoArgs(line);
			if (args.length == 1) {
				return [shell.commands.map(cmd => cmd.name()).filter(cmd => cmd.startsWith(args[0])), line];
			}

			const cmd = shell.commands.find(cmd => cmd.name() === args[0]);
			if (!cmd || !cmd.registeredArguments.length) return [[], line];

			const items = await getDirectory('');
			return [
				items
					.map(i => i.name)
					.filter(name => name.startsWith(args[1]))
					.map(name => `${args[0]} ${name.replaceAll(' ', '\\ ')}`),
				line,
			];
		},
	});

	readline.prompt();
	for await (const line of readline) {
		readline.pause();
		const args = splitIntoArgs(line.trim());

		try {
			await shell.parseAsync(args, { from: 'user' });
		} catch (e) {
			if (!e || !(e instanceof CommanderError)) {
				io.done(true);
				io.error(io.errorText(e));
			}
		}
		readline.prompt();
	}
	console.log('exit');
}
