import type { $API, APIParameters, Endpoint, RequestBody } from '@axium/core/api';
import type { RequestMethod } from '@axium/core/requests';

export let token: string | null = null;

export function setToken(value: string | null): void {
	token = value;
}

export let prefix = '/api/';

export function setPrefix(value: string): void {
	prefix = value;
}

export async function fetchAPI<const M extends RequestMethod, const E extends Endpoint>(
	method: M,
	endpoint: E,
	data?: RequestBody<M, E>,
	...params: APIParameters<E>
): Promise<M extends keyof $API[E] ? ($API[E][M] extends [unknown, infer R] ? R : $API[E][M]) : unknown> {
	const options: RequestInit & { headers: Record<string, string> } = {
		method,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	};

	if (method !== 'GET' && method !== 'HEAD') options.body = JSON.stringify(data);
	const search =
		method != 'GET' || typeof data != 'object' || data == null || !Object.keys(data).length
			? ''
			: '?' + new URLSearchParams(data as Record<string, string>).toString();

	if (token) options.headers.Authorization = 'Bearer ' + token;

	const parts = [];

	for (const part of endpoint.split('/')) {
		if (!part.startsWith(':')) {
			parts.push(part);
			continue;
		}
		const value = params.shift();
		if (!value) throw new Error(`Missing parameter "${part.slice(1)}"`);
		parts.push(value);
	}

	const response = await fetch(prefix + parts.join('/') + search, options);

	if (!response.headers.get('Content-Type')?.includes('application/json')) {
		throw new Error(`Unexpected response type: ${response.headers.get('Content-Type')}`);
	}

	const json: any = await response.json().catch(() => ({ message: 'Unknown server error (invalid JSON response)' }));

	if (!response.ok) throw new Error(json.message);

	return json;
}
