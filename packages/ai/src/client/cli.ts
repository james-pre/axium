import { config } from '@axium/client/cli/config';
import { fetchAPI } from '@axium/client/requests';
import { program } from 'commander';
import * as io from 'ioium/node';
import { spawn } from 'node:child_process';
import { styleText } from 'node:util';
import * as format from 'utilium/format';
import { isUsable } from '../common.js';

const cli = program.command('ai').helpGroup('Plugins:').description('CLI integration for @axium/ai');

/** The gateway URL and this client's session token */
function gateway(): { url: string; token: string } {
	if (!config.server || !config.token) io.exit('Not logged in. Run `axc login` first.', 4);
	return { url: new URL('/api/ai/gateway', config.server).href, token: config.token };
}

async function resolveModel(requested?: string): Promise<string> {
	const { models, default: fallback } = await fetchAPI('GET', 'ai/models');
	const usable = models.filter(isUsable);

	if (requested) {
		if (!usable.some(model => model.id == requested)) {
			io.exit(`Unknown or unavailable model "${requested}". Available: ${usable.map(model => model.id).join(', ')}`, 2);
		}
		return requested;
	}

	const model = fallback ?? usable[0]?.id;
	if (!model) io.exit('No models are available', 3);
	return model;
}

/** Environment variables that point Anthropic and OpenAI clients at the gateway */
async function environment(requestedModel?: string): Promise<Record<string, string>> {
	const { url, token } = gateway();
	const model = await resolveModel(requestedModel);

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
		const { models, default: fallback } = await fetchAPI('GET', 'ai/models');

		for (const model of models) {
			const status = isUsable(model) ? styleText('green', model.status) : styleText('yellow', model.status);
			console.log(
				styleText('bold', model.name),
				styleText('dim', model.id),
				status,
				styleText('blueBright', format.bytes(model.size)),
				model.id == fallback ? styleText('cyan', '(default)') : ''
			);
		}
	});

cli.command('create-env')
	.description('Print shell exports that point Anthropic and OpenAI clients at the AI gateway, using this client’s session')
	.option('-m, --model <id>', 'the model to use instead of the default')
	.action(async (options: { model?: string }) => {
		for (const [name, value] of Object.entries(await environment(options.model))) {
			console.log(`export ${name}=${shellQuote(value)}`);
		}
	});

cli.command('claude')
	.description('Run Claude Code against the AI gateway, using this client’s session. Other arguments are passed to Claude Code.')
	.option('-m, --model <id>', 'the model to use instead of the default')
	.argument('[args...]')
	.allowUnknownOption()
	.action(async (args: string[], options: { model?: string }) => {
		const env = { ...process.env, ...(await environment(options.model)) };
		const child = spawn('claude', args, { stdio: 'inherit', env });

		child.on('error', error => io.exit('Could not run Claude Code: ' + io.errorText(error), 5));
		child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
	});
