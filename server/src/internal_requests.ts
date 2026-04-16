import type { Http2ServerRequest, Http2ServerResponse } from 'node:http2';
import { config } from './config.js';

/* Credit to the SvelteKit team: https://github.com/sveltejs/kit/blob/8d1ba04825a540324bc003e85f36559a594aadc2/packages/kit/src/exports/node/index.js */
function get_raw_body(req: Http2ServerRequest): ReadableStream | null {
	if (!req.headers['content-type'] || req.method == 'GET' || req.method == 'HEAD') return null;

	const content_length = Number(req.headers['content-length']);

	// check if no request body
	if ((req.httpVersionMajor === 1 && isNaN(content_length) && req.headers['transfer-encoding'] == null) || content_length === 0) {
		return null;
	}

	let length = content_length;

	if (config.request_size_limit) {
		if (!length) length = config.request_size_limit;
		else if (length > config.request_size_limit) throw 413;
	}

	if (req.destroyed) {
		const readable = new ReadableStream();
		void readable.cancel();
		return readable;
	}

	let size = 0;
	let cancelled = false;

	return new ReadableStream({
		start(controller) {
			req.on('error', error => {
				cancelled = true;
				controller.error(error);
			});

			req.on('end', () => {
				if (cancelled) return;
				controller.close();
			});

			req.on('data', chunk => {
				if (cancelled) return;

				size += chunk.length;
				if (size > length) {
					cancelled = true;
					controller.error(413);
					return;
				}

				controller.enqueue(chunk);

				if (controller.desiredSize === null || controller.desiredSize <= 0) {
					req.pause();
				}
			});
		},

		pull() {
			req.resume();
		},

		cancel(reason) {
			cancelled = true;
			req.destroy(reason);
		},
	});
}

export function convertToRequest(req: Http2ServerRequest): Request {
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined || key[0] == ':') continue;
		if (!Array.isArray(value)) headers.append(key, String(value));
		else for (const v of value) headers.append(key, String(v));
	}

	const request = new Request(config.origin + req.url, {
		// @ts-expect-error 2353
		duplex: 'half',
		method: req.method,
		headers,
		body: get_raw_body(req),
	});
	return request;
}

export async function convertFromResponse(res: Http2ServerResponse, response: Response): Promise<void> {
	res.writeHead(response.status, Object.fromEntries(response.headers));

	if (!response.body) {
		res.end();
		return;
	}

	if (response.body.locked) {
		res.write(
			'Fatal error: Response body is locked. ' +
				`This can happen when the response was already read (for example through 'response.json()' or 'response.text()').`
		);
		res.end();
		return;
	}

	const reader = response.body.getReader();

	if (res.destroyed) {
		await reader.cancel();
		return;
	}

	const cancel = (error?: Error) => {
		res.off('close', cancel);
		res.off('error', cancel);

		// If the reader has already been interrupted with an error earlier,
		// then it will appear here, it is useless, but it needs to be caught.
		reader.cancel(error).catch(() => {});
		if (error) res.destroy(error);
	};

	res.on('close', cancel);
	res.on('error', cancel);

	async function next() {
		try {
			for (;;) {
				const { done, value } = await reader.read();

				if (done) break;

				if (!res.write(value)) {
					// eslint-disable-next-line @typescript-eslint/no-misused-promises
					res.once('drain', next);
					return;
				}
			}
			res.end();
		} catch (error) {
			cancel(error instanceof Error ? error : new Error(String(error)));
		}
	}
	void next();
}
