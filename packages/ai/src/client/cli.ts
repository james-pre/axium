import { config } from '@axium/client/cli/config';
import { fetchAPI } from '@axium/client/requests';
import { program } from 'commander';
import * as io from 'ioium/node';
import { spawn } from 'node:child_process';
import { styleText } from 'node:util';
import * as format from 'utilium/format';
import * as ai from '../common.js';

const cli = program.command('ai').helpGroup('Plugins:').description('CLI integration for @axium/ai');

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

cli.command('models')
	.description('List the models on the server')
	.action(async () => {
		const { models, roles } = await fetchAPI('GET', 'ai/models');

		for (const model of models) {
			const status = ai.isUsable(model) ? styleText('green', model.status) : styleText('yellow', model.status);
			const serves = ai.roles.filter(role => ai.resolveRole(models, roles, role)?.id == model.id);
			console.log(
				styleText('bold', model.name),
				styleText('dim', model.id),
				status,
				styleText('blueBright', format.bytes(model.size)),
				serves.length ? styleText('cyan', `(${serves.join(', ')})`) : ''
			);
		}
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
