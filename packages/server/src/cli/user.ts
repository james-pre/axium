import { ClientConfig, resolveServerURL } from '@axium/client/config';
import type { UserInternal } from '@axium/core';
import { formatDateRange } from '@axium/core/format';
import { Argument, Option, program } from 'commander';
import * as io from 'ioium/node';
import * as fs from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { styleText } from 'node:util';
import { isRoot } from 'utilium/node';
import { audit } from '../audit.js';
import { createSession } from '../auth.js';
import config from '../config.js';
import * as db from '../db/index.js';
import { diffUpdate, lookupUser, userText } from './common.js';

const argUserLookup = new Argument('<user>', 'the UUID, username, or recovery email of the user to operate on').argParser(lookupUser);

program
	.command('user')
	.description('Get or change information about a user')
	.addArgument(argUserLookup)
	.option('-S, --sessions', 'show user sessions')
	.option('-P, --passkeys', 'show user passkeys')
	.option('--add-role <role...>', 'add roles to the user')
	.option('--remove-role <role...>', 'remove roles from the user')
	.option('--tag <tag...>', 'Add tags to the user')
	.option('--untag <tag...>', 'Remove tags from the user')
	.option('--delete', 'Delete the user')
	.option('--suspend', 'Suspend the user')
	.addOption(new Option('--unsuspend', 'Un-suspend the user').conflicts('suspend'))
	.action(async (_user: Promise<UserInternal>, opt) => {
		let user = await _user;

		const [updatedRoles, roles, rolesDiff] = diffUpdate(user.roles, opt.addRole, opt.removeRole);
		const [updatedTags, tags, tagsDiff] = diffUpdate(user.tags, opt.tag, opt.untag);
		const changeSuspend = (opt.suspend || opt.unsuspend) && user.isSuspended != (opt.suspend ?? !opt.unsuspend);

		if (updatedRoles || updatedTags || changeSuspend) {
			user = await db.database
				.updateTable('users')
				.where('id', '=', user.id)
				.set({ roles, tags, isSuspended: !changeSuspend ? user.isSuspended : (opt.suspend ?? !opt.unsuspend) })
				.returningAll()
				.executeTakeFirstOrThrow()
				.then(u => {
					if (updatedRoles && rolesDiff) console.log(`> Updated roles: ${rolesDiff}`);
					if (updatedTags && tagsDiff) console.log(`> Updated tags: ${tagsDiff}`);
					if (changeSuspend) console.log(opt.suspend ? '> Suspended' : '> Un-suspended');
					return u;
				})
				.catch(e => io.exit('Failed to update user: ' + e.message));
		}

		if (opt.delete) {
			const confirmed = await io.confirm(`Are you sure you want to delete ${userText(user, true)}?`);

			if (!confirmed) console.log(styleText('dim', '> Delete aborted.'));
			else
				await db.database
					.deleteFrom('users')
					.where('id', '=', user.id)
					.executeTakeFirstOrThrow()
					.then(() => console.log(styleText(['red', 'bold'], '> Deleted')))
					.catch(e => io.exit('Failed to delete user: ' + e.message));
		}

		console.log(
			[
				user.isSuspended && styleText('yellowBright', 'Suspended'),
				user.isAdmin && styleText('redBright', 'Administrator'),
				'UUID: ' + user.id,
				'Name: ' + user.name,
				'Username: ' + user.username,
				'Registered ' + formatDateRange(user.registeredAt),
				`Roles: ${user.roles.length ? user.roles.join(', ') : styleText('dim', '(none)')}`,
				`Tags: ${user.tags.length ? user.tags.join(', ') : styleText('dim', '(none)')}`,
				user.email &&
					`Recovery email: ${user.email}, ${user.emailVerified ? 'verified on ' + formatDateRange(user.emailVerified) : styleText(config.auth.recovery.email ? 'yellow' : 'dim', 'not verified')}`,
			]
				.filter(v => v)
				.join('\n')
		);

		if (opt.sessions) {
			const sessions = await db.database.selectFrom('sessions').where('userId', '=', user.id).selectAll().execute();

			console.log(styleText('bold', 'Sessions:'));
			if (!sessions.length) console.log(styleText('dim', '(none)'));
			else
				for (const session of sessions) {
					console.log(
						`\t${session.id}\tcreated ${formatDateRange(session.created).padEnd(40)}\texpires ${formatDateRange(session.expires).padEnd(40)}\t${session.elevated ? styleText('yellow', '(elevated)') : ''}`
					);
				}
		}

		if (opt.passkeys) {
			const passkeys = await db.database.selectFrom('passkeys').where('userId', '=', user.id).selectAll().execute();

			console.log(styleText('bold', 'Passkeys:'));
			for (const passkey of passkeys) {
				console.log(
					`\t${passkey.id}: created ${formatDateRange(passkey.createdAt).padEnd(40)} used ${passkey.counter} times. ${passkey.deviceType}, ${passkey.backedUp ? '' : 'not '}backed up; transports are [${passkey.transports.join(', ')}], ${passkey.name ? 'named ' + JSON.stringify(passkey.name) : 'unnamed'}.`
				);
			}
		}
	});

program
	.command('toggle-admin')
	.description('Toggle whether a user is an administrator')
	.addArgument(argUserLookup)
	.action(async (_user: Promise<UserInternal>) => {
		const user = await _user;

		const isAdmin = !user.isAdmin;
		await db.database.updateTable('users').set({ isAdmin }).where('id', '=', user.id).executeTakeFirstOrThrow();

		await audit('admin_change', undefined, { user: user.id });

		console.log(
			`${userText(user)} is ${isAdmin ? 'now' : 'no longer'} an administrator. (${styleText(['whiteBright', 'bold'], isAdmin.toString())})`
		);
	});

program
	.command('make-local-session')
	.description('Create a session for use with a client on the same machine. Must be run as the target user.')
	.addArgument(argUserLookup)
	.option('-s, --include-server [mode]', "Also write the server to the target user's config")
	.action(async (_user: Promise<UserInternal>, opt) => {
		const user = await _user;

		if (isRoot) io.exit('Can not make a local session as root.');

		const local = userInfo();

		const configDir = join(process.env.XDG_CONFIG_HOME || join(local.homedir, '.config'), 'axium');

		const configPath = join(configDir, 'config.json');

		let clientConfig: ClientConfig = { plugins: [] };
		if (fs.existsSync(configPath)) {
			try {
				clientConfig = io.readJSON(configPath, ClientConfig);
			} catch (e) {
				io.exit(`Failed to read ${configPath}: ${io.errorText(e)}`);
			}
		}

		const session = await createSession(user.id, 'Local Axium Client for ' + local.username).catch(e =>
			io.exit('Failed to create session: ' + e.message)
		);

		clientConfig.token = session.token;
		if (opt.includeServer)
			clientConfig.server = resolveServerURL(
				opt.includeServer == 'local' ? `${config.web.secure ? 'https' : 'http'}://localhost:${config.web.port}` : config.origin
			);

		try {
			fs.mkdirSync(configDir, { recursive: true });
			io.writeJSON(configPath, clientConfig);
			fs.chmodSync(configPath, 0o600);
		} catch (e: any) {
			io.exit(`Failed to write ${configPath}: ${io.errorText(e)}`);
		}

		console.log(`Created session ${session.id} for ${userText(user)}, expires ${formatDateRange(session.expires)}`);
	});
