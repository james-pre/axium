export const requestMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'] as const;

export type RequestMethod = (typeof requestMethods)[number];

let token: string | null = null;

export function setToken(value: string | null): void {
	token = value;
}

export async function fetchAPI<T>(method: RequestMethod, url: string, data?: object | null, init?: RequestInit): Promise<T> {
	const options = {
		...init,
		method,
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...init?.headers,
		} as Record<string, string>,
	} satisfies RequestInit;

	if (method != 'GET' && method != 'HEAD') options.body = JSON.stringify(data);

	if (token) options.headers.Authorization = 'Bearer ' + token;

	const response = await fetch(url, options);

	if (!response.headers.get('Content-Type')?.includes('application/json')) {
		throw new Error(`Unexpected response type: ${response.headers.get('Content-Type')}`);
	}

	const json: any = await response.json().catch(() => ({ message: 'Unknown server error (invalid JSON response)' }));

	if (!response.ok) throw new Error(json.message);

	return json;
}
