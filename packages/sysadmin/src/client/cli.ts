import { session } from '@axium/client/cli/config';
import { fetchAPI } from '@axium/client/requests';
import { connect } from '@axium/client/socket';
import { formatBytes, formatDuration } from '@axium/core';
import { program } from 'commander';
import * as io from 'ioium/node';
import { styleText } from 'node:util';
import type { System, SystemUser } from '../common.js';
import type { SystemInfo, TotalUsed } from '../info.js';
import './socket.js';

function usage(info: TotalUsed) {
	return styleText('blueBright', formatBytes(info.used)) + '/' + styleText('blueBright', formatBytes(info.total));
}

const num = (value: number | bigint | undefined) =>
	value === undefined ? styleText('red', '<unknown>') : styleText('blueBright', value.toString());

const tab = '   ',
	tab2 = '       ';

function dumpInfo(system: System, info: SystemInfo) {
	console.log(styleText('bold', `${system.hostname} "${system.name}"`), styleText('dim', `(${system.id})`));

	const { cpus, gpus, memory, storage, networkInterfaces, uptime, ...rest } = info;

	console.log('CPUs:');
	for (const cpu of cpus) console.log(tab, num(cpu.cores) + 'x', styleText('yellow', cpu.model));

	console.log('GPUs:');
	for (const gpu of gpus) {
		console.log(tab, styleText('yellow', gpu.model));
		if (gpu.vram) console.log(tab2, 'VRAM:', usage(gpu.vram));
	}

	console.log('Memory:', usage(memory));
	if (memory.swap) console.log(tab, 'Swap:', usage(memory.swap));

	console.log('Storage:');
	for (const drive of storage) console.log(tab, styleText('yellow', drive.model), usage(drive));

	console.log('Network:');
	for (const iface of networkInterfaces) {
		console.log(tab, styleText('cyanBright', iface.name), styleText('yellow', iface.model), iface.wireless ? '(wireless)' : '(wired)');
		if (iface.connected)
			console.log(tab2, iface.connection ? 'Connected to ' + iface.connection : 'Connected', 'at', num(iface.speed), 'MBit/s');
	}

	console.log('Uptime:', formatDuration(uptime));

	for (const [key, value] of Object.entries(rest)) {
		console.log(key + ':', value);
	}
}

async function getSystems(): Promise<System[]> {
	return await fetchAPI('GET', 'users/:id/sysadmin/systems', {}, session().userId);
}

async function getUsers(): Promise<SystemUser[]> {
	return await fetchAPI('GET', 'users/:id/sysadmin/users', {}, session().userId);
}

/** Resolve a system by its ID or hostname. */
function resolveSystem(systems: System[], search: string): System {
	const system = systems.find(s => s.id === search || s.hostname === search);
	if (!system) io.exit(`No system matching "${search}".`);
	return system;
}

/** Resolve a system user by its ID or username. */
function resolveUser(users: SystemUser[], search: string): SystemUser {
	const user = users.find(u => u.id === search || u.username === search);
	if (!user) io.exit(`No system user matching "${search}".`);
	return user;
}

function listSystems(systems: System[]) {
	for (const system of systems) {
		console.log(
			styleText('bold', system.hostname),
			styleText('yellow', system.type),
			`"${system.name}"`,
			styleText('dim', `(${system.id})`)
		);
	}
}

function listUsers(users: SystemUser[]) {
	for (const user of users) {
		console.log(styleText('bold', user.username), `"${user.name}"`, styleText('dim', `(${user.id})`));
	}
}

const cli = program.command('sysadmin').helpGroup('Plugins:').description('CLI integration for @axium/sysadmin');

cli.action(async () => {
	const [systems, users] = await Promise.all([getSystems(), getUsers()]);

	console.log(styleText('whiteBright', `${systems.length} system(s):`));
	listSystems(systems);

	console.log(styleText('whiteBright', `\n${users.length} user(s):`));
	listUsers(users);
});

cli.command('systems')
	.description('List systems')
	.action(async () => listSystems(await getSystems()));

cli.command('users')
	.description('List system users')
	.action(async () => listUsers(await getUsers()));

cli.command('system')
	.description('Show information about a system')
	.argument('<system>', 'the hostname or ID of the system')
	.option('--insecure', 'allow connecting to a server with an untrusted (e.g. self-signed) TLS certificate', false)
	.action(async (search: string, opt) => {
		const system = resolveSystem(await getSystems(), search);

		const socket = await connect({ rejectUnauthorized: !opt.insecure });
		const all = await socket.emitWithAck('sysadmin:getSystemInfo').catch(() => undefined);
		const info = all?.find(i => i.hostname === system.hostname);

		if (!info) {
			console.log(styleText('bold', `${system.hostname} "${system.name}"`), styleText('dim', `(${system.id})`));
			io.exit('System is offline; live information is unavailable.', 1);
		}

		dumpInfo(system, info);
		process.exit();
	});

cli.command('user')
	.description('Show information about a system user')
	.argument('<user>', 'the username or ID of the system user')
	.action(async (search: string) => {
		const user = resolveUser(await getUsers(), search);

		console.log(styleText('bold', `${user.username} "${user.name}"`), styleText('dim', `(${user.id})`));
	});
