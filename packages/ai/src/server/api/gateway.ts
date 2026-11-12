import { getSessionAndUser, type SessionAndUser } from '@axium/server/auth';
import { error, isResponseError, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import features from '@axium/core/features';
import * as io from 'ioium';
import * as ai from '../../common.js';
import * as llama from '../../node/llama.js';
import { getRows, resolveRole } from '../models.js';

type Format = 'openai' | 'anthropic';

const anthropicErrorTypes: Record<number, string> = {
	400: 'invalid_request_error',
	401: 'authentication_error',
	403: 'permission_error',
	404: 'not_found_error',
	503: 'overloaded_error',
};

/** An error in the format the client's API uses */
function errorResponse(format: Format, status: number, message: string): Response {
	const body =
		format == 'anthropic'
			? { type: 'error', error: { type: anthropicErrorTypes[status] ?? 'api_error', message } }
			: { error: { message, type: status < 500 ? 'invalid_request_error' : 'server_error', code: status } };
	return Response.json(body, { status });
}

/** Authenticates with a session token, as OpenAI clients (`Authorization`) and Anthropic clients (`x-api-key`) send it */
async function authenticate(request: Request): Promise<SessionAndUser> {
	if (!features('ai-gateway')) error(403, 'The AI gateway is disabled');

	const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || request.headers.get('x-api-key');
	if (!token) error(401, 'Missing API key');

	const session = await getSessionAndUser(token).catch(withError('Invalid or expired API key', 401));
	if (session.user.isSuspended) error(403, 'User is suspended');

	return session;
}

async function handle(format: Format, run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (cause) {
		if (isResponseError(cause)) return errorResponse(format, cause.status, cause.message);
		io.warn('AI: gateway request failed:', io.errorText(cause));
		return errorResponse(format, 502, io.errorText(cause));
	}
}

/** Paths under `/v1/` that are forwarded to llama-server, by the API format they use */
const forwarded: Record<string, Format> = {
	'chat/completions': 'openai',
	'chat/completions/input_tokens': 'openai',
	completions: 'openai',
	responses: 'openai',
	'responses/input_tokens': 'openai',
	embeddings: 'openai',
	messages: 'anthropic',
	'messages/count_tokens': 'anthropic',
};

for (const [path, format] of Object.entries(forwarded)) {
	addRoute({
		path: '/api/ai/gateway/v1/' + path,
		async POST(request) {
			return await handle(format, async () => {
				await authenticate(request);
				if (!llama.isRunning()) error(503, 'llama-server is not running');

				const body = await request.json().catch(withError('The request body must be JSON', 400));

				const models = await getRows();
				if (!models.some(model => model.id == body?.model)) {
					const role = ai.Role.safeParse(body?.model);
					if (!role.success) {
						const available = [...models.map(model => model.id), ...ai.roles].join(', ');
						error(404, `Unknown model "${body?.model}". Available: ${available}`);
					}
					body.model = (await resolveRole(role.data)) ?? error(503, `No model is available for the ${role.data} role`);
				}

				const upstream = await llama.send('v1/' + path, {
					method: 'POST',
					body: JSON.stringify(body),
					signal: request.signal,
				});

				return new Response(upstream.body, {
					status: upstream.status,
					headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
				});
			});
		},
	});
}

addRoute({
	path: '/api/ai/gateway/v1/models',
	async GET(request) {
		return await handle('openai', async () => {
			await authenticate(request);

			const models = await getRows();

			/** Fields from both the OpenAI and Anthropic model list formats */
			const data = models.map(model => ({
				id: model.id,
				object: 'model',
				type: 'model',
				display_name: model.name,
				created: Math.floor(model.created.getTime() / 1000),
				created_at: model.created.toISOString(),
				owned_by: 'axium',
			}));

			return Response.json({
				object: 'list',
				data,
				has_more: false,
				first_id: data[0]?.id ?? null,
				last_id: data.at(-1)?.id ?? null,
			});
		});
	},
});
