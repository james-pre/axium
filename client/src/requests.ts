import type { APIParameters, APIValues, Endpoint, RequestBody } from '@axium/core/api';
import { $API } from '@axium/core/api';
import type { RequestMethod } from '@axium/core/requests';
import { prettifyError } from 'zod';

export let token: string | null = null;

export function setToken(value: string | null): void {
	token = value;
}

export let prefix = '/api/';

export function setPrefix(value: string): void {
	prefix = value;
}

export async function fetchAPI<const E extends Endpoint, const M extends keyof $API[E] & RequestMethod>(
	method: M,
	endpoint: E,
	data?: RequestBody<M, E>,
	...params: APIParameters<E>
): Promise<M extends keyof APIValues[E] ? (APIValues[E][M] extends readonly [unknown, infer R] ? R : APIValues[E][M]) : unknown> {
	const options: RequestInit & { headers: Record<string, string> } = {
		method,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		},
	};

	const schema = $API[endpoint]?.[method];

	if (schema && Array.isArray(schema))
		try {
			data = schema[0].parse(data);
		} catch (e: any) {
			throw prettifyError(e);
		}

	if (method !== 'GET' && method !== 'HEAD') options.body = JSON.stringify(data);
	const search =
		method != 'GET' || typeof data != 'object' || data == null || !Object.keys(data).length
			? ''
			: '?' + new URLSearchParams(JSON.parse(JSON.stringify(data))).toString();

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

	if (typeof json == 'object' && json != null && '_warnings' in json) {
		for (const warning of json._warnings) console.warn('[API]', warning);
		delete json._warnings;
	}

	if (!schema) return json;

	const Output = Array.isArray(schema) ? schema[1] : schema;

	try {
		return Output.parse(json);
	} catch (e: any) {
		throw `${method} ${endpoint}:\n${prettifyError(e)}`;
	}
}
