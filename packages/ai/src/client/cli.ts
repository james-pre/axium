import { config } from '@axium/client/cli/config';
import { fetchAPI } from '@axium/client/requests';
import { configCommand } from '@james-pre/config/cli';
import { program } from 'commander';
import * as io from 'ioium/node';
import { spawn } from 'node:child_process';
import { styleText } from 'node:util';
import * as format from 'utilium/format';
import * as ai from '../common.js';
import * as llama from '../node/llama.js';
import * as models from '../node/models.js';
import { configManager } from './config.js';
import * as local from './local.js';

const cli = program.command('ai').helpGroup('Plugins:').description('CLI integration for @axium/ai');

configCommand(cli, configManager, { defaultType: 'user', sensitive: ['hf_token'] }).description('Manage this device’s AI settings');

/** The gateway URL and this client's session token */
function gateway(): { url: string; token: string } {
	if (!config.server || !config.token) io.exit('Not logged in. Run `axc login` first.', 4);
	return { url: new URL('/api/ai/gateway', config.server).href, token: config.token };
}

/**
 * Checks that a model or role can be used. The gateway resolves roles on each request,
 * so a role keeps working when its first model becomes unavailable.
 */
async function checkModel(requested: string): Promise<void> {
	const { models, roles } = await fetchAPI('GET', 'ai/models');
	const usable = models.filter(ai.isUsable);
	const role = ai.Role.safeParse(requested);

	if (usable.some(model => model.id == requested)) return;
	if (!role.success) {
		io.exit(`Unknown or unavailable model "${requested}". Available: ${[...usable.map(model => model.id), ...ai.roles].join(', ')}`, 2);
	}
	if (!ai.resolveRole(models, roles, role.data)) io.exit(`No model is available for the ${role.data} role`, 3);
}

/** Environment variables that point Anthropic and OpenAI clients at the gateway */
async function environment(model: string = 'coding'): Promise<Record<string, string>> {
	const { url, token } = gateway();
	await checkModel(model);

	return {
		ANTHROPIC_BASE_URL: url,
		ANTHROPIC_AUTH_TOKEN: token,
		ANTHROPIC_MODEL: model,
		ANTHROPIC_DEFAULT_OPUS_MODEL: model,
		ANTHROPIC_DEFAULT_SONNET_MODEL: model,
		ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
		OPENAI_BASE_URL: url + '/v1',
		OPENAI_API_KEY: token,
		OPENAI_MODEL: model,
	};
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/** The device's models, connecting to its llama-server when it runs */
async function localModels(): Promise<ai.Model[]> {
	await local.connect().catch(error => io.warn(io.errorText(error)));
	return (await local.getModels()).models;
}

async function serverModels(): Promise<Pick<ai.Models, 'models' | 'roles'> | undefined> {
	if (!config.token) return;
	return await fetchAPI('GET', 'ai/models').catch(error => {
		io.warn('Could not get the server’s models: ' + io.errorText(error));
		return undefined;
	});
}

function printModel(model: ai.Model, serves: ai.Role[]): void {
	const status = ai.isUsable(model) ? styleText('green', model.status) : styleText('yellow', model.status);
	const progress = model.progress?.total ? ` ${Math.floor((model.progress.done / model.progress.total) * 100)}%` : '';
	console.log(
		'  ' + styleText('bold', model.name),
		styleText('dim', model.id),
		status + progress,
		styleText('blueBright', format.bytes(model.size)),
		serves.length ? styleText('cyan', `(${serves.join(', ')})`) : ''
	);
}

const cli_models = cli
	.command('models')
	.description('List the models on this device and the server')
	.action(async () => {
		const [device, server] = await Promise.all([localModels(), serverModels()]);
		const deviceRoles = local.getRoles();

		console.log(styleText('whiteBright', 'This device:'));
		for (const model of device)
			printModel(
				model,
				ai.roles.filter(role => ai.firstServable(device, deviceRoles[role], role)?.id == model.id)
			);
		if (!device.length) console.log(styleText('dim', '  No models. Add one with `axc ai models add <repository>`.'));

		if (!server) return;
		console.log(styleText('whiteBright', 'Server:'));
		for (const model of server.models) {
			printModel(
				model,
				ai.roles.filter(role => ai.resolveRole(server.models, server.roles, role)?.id == model.id)
			);
		}
	});

/** Shows a download's progress until it finishes */
async function followDownload(id: string, events: AsyncGenerator<llama.RouterEvent>): Promise<void> {
	const model = await models.get(id);
	if (model?.status != 'downloading') return;

	io.start('Downloading ' + model.name);
	for await (const event of events) {
		if (event.model != model.source) continue;

		if (event.event == 'download_failed') throw new Error('The download failed: ' + JSON.stringify(event.data ?? {}));
		if (event.event == 'download_finished') break;
		if (event.event != 'download_progress') continue;

		let done = 0,
			total = 0;
		for (const file of Object.values(event.data as Record<string, ai.DownloadProgress>)) {
			done += file.done;
			total += file.total;
		}
		if (done < total) io.progress(done, total, undefined, `${format.bytes(done)} of ${format.bytes(total)}`);
	}
	io.done();
}

cli_models
	.command('add')
	.description('Download a model from Hugging Face to this device')
	.argument('<repository>', 'the Hugging Face repository, e.g. unsloth/gemma-4-E4B-it-GGUF')
	.argument('[quantization]', 'e.g. Q4_K_M; asked for when not given')
	.option('-n, --name <name>', 'the display name')
	.option('-i, --id <id>', 'the model ID, from the name by default')
	.option('--no-wait', 'return once the download starts')
	.action(async (repository: string, quantization: string | undefined, options: { name?: string; id?: string; wait: boolean }) => {
		await local.connect().catch(io.exit);

		io.start('Getting ' + repository);
		const details = await local.details(repository).catch(io.exit);
		io.done();

		const fit = (quant: ai.HubQuant) => ({ device: 'fits in VRAM', host: 'needs RAM', none: styleText('red', 'too large') })[quant.fit];

		quantization ??= await io.select(
			'Quantization',
			details.quants.map(quant => ({ name: `${quant.tag} (${format.bytes(quant.size)}, ${fit(quant)})`, value: quant.tag }))
		);

		const name = options.name ?? ai.nameFromRepo(details.base ?? details.repo);
		const id = ai.ModelId.parse(options.id ?? ai.modelIdFrom(name));

		const controller = new AbortController();
		const events = await llama.follow(controller.signal).catch(io.exit);

		const model = await local.add({ id, name, repo: details.repo, quant: quantization }).catch(io.exit);
		console.log(`Added ${styleText('bold', model.name)} ${styleText('dim', `(${model.id})`)}`);

		if (options.wait) await followDownload(id, events).catch(io.exit);
		controller.abort();
	});

cli_models
	.command('remove')
	.alias('rm')
	.description('Delete a model from this device')
	.argument('<id>')
	.option('-y, --yes', 'do not ask for confirmation')
	.action(async (id: string, options: { yes?: boolean }) => {
		await local.connect().catch(io.exit);
		if (!options.yes) await io.assertYes(`Delete ${id} and its files?`);
		await local.remove(id).catch(io.exit);
		console.log('Deleted', id);
	});

for (const action of ['load', 'unload'] as const) {
	cli_models
		.command(action)
		.description(`${action == 'load' ? 'Load' : 'Unload'} a model on this device`)
		.argument('<id>')
		.action(async (id: string) => {
			await local.connect().catch(io.exit);
			if (!(await models.get(id))) io.exit(`There is no local model "${id}"`, 2);
			await llama[action](id).catch(io.exit);
		});
}

cli_models
	.command('search')
	.description('Search Hugging Face for models to add')
	.argument('<query...>')
	.action(async (query: string[]) => {
		const results = await local.search(query.join(' ')).catch(io.exit);
		for (const repo of results) {
			console.log(styleText('bold', repo.id), styleText('dim', `${repo.downloads.toLocaleString()} downloads, ${repo.likes} likes`));
		}
	});

const cli_roles = cli
	.command('roles')
	.description('Show which model each role uses: the first usable model in this device’s list, then the server’s')
	.action(async () => {
		const [device, server] = await Promise.all([localModels(), serverModels()]);
		const deviceRoles = local.getRoles();

		for (const role of ai.roles) {
			const onDevice = ai.firstServable(device, deviceRoles[role], role);
			const onServer = server && ai.resolveRole(server.models, server.roles, role);
			const using = onDevice
				? `${onDevice.name} ${styleText('dim', '(this device)')}`
				: onServer
					? `${onServer.name} ${styleText('dim', '(server)')}`
					: styleText('yellow', 'none');

			const list = deviceRoles[role].length ? styleText('dim', ` [${deviceRoles[role].join(', ')}]`) : '';
			console.log(styleText('bold', role.padEnd(10)), using + list);
		}
	});

cli_roles
	.command('set')
	.description('Set the local models a role uses, most preferred first; none clears the list')
	.argument('<role>', ai.roles.join(', '))
	.argument('[models...]')
	.action((role: string, ids: string[]) => {
		const parsed = ai.Role.safeParse(role);
		if (!parsed.success) io.exit(`Unknown role "${role}". Roles: ${ai.roles.join(', ')}`, 2);
		local.setRoles({ [parsed.data]: ids });
	});

cli.command('create-env')
	.description('Print shell exports that point Anthropic and OpenAI clients at the AI gateway, using this client’s session')
	.option('-m, --model <id>', 'a model or role to use instead of the coding role')
	.action(async (options: { model?: string }) => {
		for (const [name, value] of Object.entries(await environment(options.model))) {
			console.log(`export ${name}=${shellQuote(value)}`);
		}
	});

cli.command('claude')
	.description('Run Claude Code against the AI gateway, using this client’s session. Other arguments are passed to Claude Code.')
	.option('-m, --model <id>', 'a model or role to use instead of the coding role')
	.argument('[args...]')
	.allowUnknownOption()
	.action(async (args: string[], options: { model?: string }) => {
		const env = { ...process.env, ...(await environment(options.model)) };
		const child = spawn('claude', args, { stdio: 'inherit', env });

		child.on('error', error => io.exit('Could not run Claude Code: ' + io.errorText(error), 5));
		child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
	});
