import type { RequestMethod } from '@axium/core/requests';
import type { Endpoint, RequestBody, Result, APIParameters } from '@axium/core/api';

let token: string | null = null;

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
): Promise<Result<M, E>> {
	const options: RequestInit & { headers: Record<string, string> } = {
		method,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	};

	if (method !== 'GET' && method !== 'OPTIONS') options.body = JSON.stringify(data);

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

	const response = await fetch(prefix + parts.join('/'), options);

	if (!response.headers.get('Content-Type')?.includes('application/json')) {
		throw new Error(`Unexpected response type: ${response.headers.get('Content-Type')}`);
	}

	const json: any = await response.json().catch(() => ({ message: 'Unknown server error (invalid JSON response)' }));

	if (!response.ok) throw new Error(json.message);

	return json;
}
