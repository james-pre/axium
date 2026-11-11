import { getConfig } from '@axium/core';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import * as z from 'zod';
import { htmlToMarkdown } from './markdown.js';
import * as tools from './tools.js';

/** Addresses tools may not reach, so the model can't be used to probe the server's network */
const blocked = new BlockList();
for (const [network, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['224.0.0.0', 4],
	['240.0.0.0', 4],
] as const)
	blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
	['::', 128],
	['::1', 128],
	['64:ff9b::', 96],
	['2001::', 32],
	['2002::', 16],
	['fc00::', 7],
	['fe80::', 10],
	['ff00::', 8],
] as const)
	blocked.addSubnet(network, prefix, 'ipv6');

function isBlocked(address: string): boolean {
	const family = isIP(address);
	return !family || blocked.check(address, family == 6 ? 'ipv6' : 'ipv4');
}

/** Resolves like `dns.lookup`, but fails for blocked addresses */
const publicLookup = ((hostname: string, options: LookupOptions, callback: (...args: any[]) => void) => {
	dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
		if (error) return callback(error);
		if (!addresses.length || addresses.some(entry => isBlocked(entry.address))) {
			return callback(new Error(`${hostname} resolves to a private or reserved address`));
		}
		if (options.all) callback(null, addresses);
		else callback(null, addresses[0].address, addresses[0].family);
	});
}) as LookupFunction;

/** Bytes read from a page */
const maxBytes = 2 * 1024 * 1024;

const userAgent = 'Mozilla/5.0 (compatible; AxiumAI/1.0)';

interface Page {
	url: URL;
	type: string;
	body: string;
}

async function fetchPublic(url: URL, signal: AbortSignal, redirects: number = 5): Promise<Page> {
	if (url.protocol != 'http:' && url.protocol != 'https:') throw new Error('Only http and https URLs can be fetched');

	const literal = url.hostname.replace(/^\[|\]$/g, '');
	if (isIP(literal) && isBlocked(literal)) throw new Error(`${literal} is a private or reserved address`);

	const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
		const request = (url.protocol == 'https:' ? https : http).get(
			url,
			{
				lookup: publicLookup,
				signal,
				timeout: 15_000,
				headers: { 'User-Agent': userAgent, Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5' },
			},
			resolve
		);
		request.on('error', reject);
		request.on('timeout', () => request.destroy(new Error('Timed out')));
	});

	const status = response.statusCode ?? 0;

	if (status >= 300 && status < 400 && response.headers.location) {
		response.resume();
		if (!redirects) throw new Error('Too many redirects');
		return await fetchPublic(new URL(response.headers.location, url), signal, redirects - 1);
	}

	if (status >= 400) {
		response.resume();
		throw new Error(`The server responded with ${status} ${response.statusMessage ?? ''}`.trim());
	}

	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of response as AsyncIterable<Buffer>) {
		chunks.push(chunk);
		size += chunk.length;
		if (size < maxBytes) continue;
		response.destroy();
		break;
	}

	const type = response.headers['content-type'] ?? '';
	const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? 'utf-8';
	let decoder: TextDecoder;
	try {
		decoder = new TextDecoder(charset);
	} catch {
		decoder = new TextDecoder();
	}

	return { url, type: type.split(';')[0].trim().toLowerCase(), body: decoder.decode(Buffer.concat(chunks).subarray(0, maxBytes)) };
}

/** A page as the model reads it */
interface Readable {
	url: string;
	title?: string;
	text: string;
}

/** Recently read pages by requested URL, so reading further into one doesn't fetch it again */
const recent = new Map<string, { expires: number; page: Readable }>();

/** Milliseconds a page is kept */
const keepTime = 15 * 60_000;
const keepCount = 32;

async function read(url: string, signal: AbortSignal): Promise<Readable> {
	const now = Date.now();
	for (const [key, entry] of recent) if (entry.expires < now) recent.delete(key);

	const cached = recent.get(url);
	if (cached) return cached.page;

	const page = await fetchPublic(new URL(url), signal);
	let readable: Readable;

	if (page.type == 'text/html' || page.type == 'application/xhtml+xml') {
		const { title, markdown } = htmlToMarkdown(page.body, page.url);
		readable = { url: page.url.href, title, text: markdown };
	} else if (page.type.startsWith('text/') || page.type.includes('json') || page.type.includes('xml')) {
		readable = { url: page.url.href, text: page.body };
	} else {
		throw new Error(`Can't read ${page.type || 'this kind of content'}`);
	}

	recent.set(url, { expires: now + keepTime, page: readable });
	if (recent.size > keepCount) recent.delete(recent.keys().next().value!);

	return readable;
}

/** Characters of a page given to the model at once */
const partSize = 20_000;

tools.add({
	name: 'fetch_url',
	description:
		"Reads a public web page or text file. HTML is converted to Markdown with only the page's main content. " +
		'Long pages are returned in parts: when a result has `next`, call again with it as `offset` to read further.',
	environment: 'web',
	access: 'read',
	input: z.object({
		url: z.url({ protocol: /^https?$/ }).describe('An absolute http or https URL'),
		offset: z.int().nonnegative().optional().describe('Where to continue reading, from `next` in an earlier result'),
	}),
	async run({ url, offset = 0 }, { signal }) {
		const page = await read(url, signal);

		let text = page.text.slice(offset, offset + partSize);
		if (offset + text.length < page.text.length) {
			const paragraph = text.lastIndexOf('\n\n');
			const line = text.lastIndexOf('\n');
			const breakAt = paragraph > partSize / 2 ? paragraph : line;
			if (breakAt > partSize / 2) text = text.slice(0, breakAt);
		}

		const end = offset + text.length;
		return {
			url: page.url,
			title: page.title,
			text,
			...(end < page.text.length && { next: end, length: page.text.length }),
		};
	},
});

const SearchResponse = z.object({
	results: z
		.object({
			url: z.string(),
			title: z.string().optional(),
			content: z.string().optional(),
			publishedDate: z.string().nullish(),
		})
		.array(),
});

tools.add({
	name: 'search_web',
	description: 'Searches the web. Returns titles, URLs and snippets; use fetch_url to read a result.',
	environment: 'web',
	access: 'read',
	available: () => !!getConfig('@axium/ai').search_url,
	input: z.object({
		query: z.string().min(1).max(400).describe('What to search for, as you would type it into a search engine'),
		page: z.int().min(1).max(10).optional().describe('Result page, starting at 1'),
	}),
	async run({ query, page }, { signal }) {
		const url = new URL('search', getConfig('@axium/ai').search_url!.replace(/\/?$/, '/'));
		url.searchParams.set('q', query);
		url.searchParams.set('format', 'json');
		if (page) url.searchParams.set('pageno', String(page));

		const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
		if (!response.ok) throw new Error(`The search service responded with ${response.status}`);

		const { results } = SearchResponse.parse(await response.json());

		return results.slice(0, 10).map(result => ({
			title: result.title,
			url: result.url,
			snippet: result.content,
			published: result.publishedDate ?? undefined,
		}));
	},
});
