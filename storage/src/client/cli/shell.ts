import { Command, CommanderError } from 'commander';
import * as io from 'ioium/node';
import { spawnSync } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline/promises';
import { styleText } from 'node:util';
import { splitIntoArgs } from 'utilium/shell';
import { getDirectory, remotePWD, setRemotePWD } from '../local.js';
import * as commands from './commands.js';

let readline: Interface;

const promptChar = '>';

function promptText(): string {
	return styleText('green', remotePWD) + promptChar + ' ';
}

const shell = new Command(promptChar)
	.exitOverride()
	.addCommand(commands.ls.exitOverride())
	.addCommand(commands.mkdir.exitOverride())
	.addCommand(commands.remove.exitOverride());

const shellLocal = shell
	.command('local')
	.description('Execute a regular command locally')
	.argument('<command>', 'command to execute locally, will be passed through without any changes');

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

			if (args.length == 1 && !line.endsWith(' ')) {
				return [shell.commands.map(cmd => cmd.name() + ' ').filter(cmd => cmd.startsWith(args[0])), line];
			}

			const cmd = shell.commands.find(cmd => cmd.name() === args[0]);
			if (!cmd || !cmd.registeredArguments.length) return [[], line];

			let dir = '',
				name = args[1] || '';

			if (name.includes('/')) {
				const parts = name.split('/');
				name = parts.pop()!;
				dir = parts.join('/').replaceAll(' ', '\\ ') + '/';
			}

			const items = await getDirectory(dir);
			return [
				items
					.map(i => (i.type == 'inode/directory' ? i.name + '/' : i.name))
					.filter(itemName => !name || itemName.startsWith(name))
					.map(itemName => itemName.replaceAll(' ', '\\ ')),
				line.slice(args[0].length + 1 + dir.length),
			];
		},
	});

	readline.prompt();
	for await (const line of readline) {
		readline.pause();

		if (line.startsWith('local ')) {
			const localCommand = line.slice(6).trim();
			if (!localCommand || localCommand.startsWith('-')) {
				console.log(shellLocal.helpInformation());
				readline.prompt();
				continue;
			}
			try {
				spawnSync(localCommand, { stdio: 'inherit', shell: true });
			} catch (e) {
				io.error(io.errorText(e));
			}
			readline.prompt();
			continue;
		}

		const args = splitIntoArgs(line.trim());

		try {
			if (args.length) await shell.parseAsync(args, { from: 'user' });
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
