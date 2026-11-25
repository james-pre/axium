import { getConfig } from '@axium/core';
import * as http from 'node:http';
import * as https from 'node:https';
import * as z from 'zod';
import type { Element } from 'domhandler';
import { DomUtils, parseDocument } from 'htmlparser2';
import { htmlToMarkdown } from './markdown.js';
import { checkLiteral, publicLookup } from './network.js';
import * as tools from '../tools.js';

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

	checkLiteral(url.hostname);

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

interface SearchResult {
	title?: string;
	url: string;
	snippet?: string;
	published?: string;
}

const SearXNGResponse = z.object({
	results: z
		.object({
			url: z.string(),
			title: z.string().optional(),
			content: z.string().optional(),
			publishedDate: z.string().nullish(),
		})
		.array(),
});

async function searchSearXNG(instance: string, query: string, page: number, signal: AbortSignal): Promise<SearchResult[]> {
	const url = new URL('search', instance.replace(/\/?$/, '/'));
	url.searchParams.set('q', query);
	url.searchParams.set('format', 'json');
	url.searchParams.set('pageno', String(page));

	const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
	if (!response.ok) throw new Error(`The search service responded with ${response.status}`);

	const { results } = SearXNGResponse.parse(await response.json());
	return results.map(result => ({
		title: result.title,
		url: result.url,
		snippet: result.content,
		published: result.publishedDate ?? undefined,
	}));
}

function hasClass(element: Element, name: string): boolean {
	return element.attribs.class?.split(/\s+/).includes(name) ?? false;
}

/** DuckDuckGo's HTML results, which needs no account or key */
async function searchDuckDuckGo(query: string, page: number, signal: AbortSignal): Promise<SearchResult[]> {
	const url = new URL('https://html.duckduckgo.com/html/');
	url.searchParams.set('q', query);
	if (page > 1) {
		url.searchParams.set('s', String((page - 1) * 10));
		url.searchParams.set('dc', String((page - 1) * 10 + 1));
	}

	const { body } = await fetchPublic(url, signal);
	const document = parseDocument(body);

	const results = DomUtils.findAll(element => hasClass(element, 'web-result') && !hasClass(element, 'result--ad'), document.children);
	if (!results.length && /anomaly|challenge/i.test(body)) {
		throw new Error('DuckDuckGo refused the search because it limits automated searches; try again later');
	}

	return results.flatMap(result => {
		const link = DomUtils.findOne(element => hasClass(element, 'result__a'), result.children);
		const href = link?.attribs.href;
		if (!link || !href) return [];

		const target = new URL(href, 'https://duckduckgo.com');
		const snippet = DomUtils.findOne(element => hasClass(element, 'result__snippet'), result.children);
		return [
			{
				title: DomUtils.textContent(link).trim(),
				url: (target.pathname == '/l/' && target.searchParams.get('uddg')) || target.href,
				snippet: snippet ? DomUtils.textContent(snippet).trim() : undefined,
			},
		];
	});
}

tools.add({
	name: 'search_web',
	description:
		'Searches the web. Returns titles, URLs and snippets; use fetch_url to read a result. ' +
		'Your training data stops at some point in the past, so search instead of answering from memory ' +
		'whenever the answer may have changed since then: news, recent events, current prices, scores, releases, or who holds a role.',
	environment: 'web',
	access: 'read',
	available() {
		const { search_url, search_fallback } = getConfig('@axium/ai');
		return !!search_url || search_fallback != 'none';
	},
	input: z.object({
		query: z.string().min(1).max(400).describe('What to search for, as you would type it into a search engine'),
		page: z.int().min(1).max(10).optional().describe('Result page, starting at 1'),
	}),
	async run({ query, page = 1 }, { signal }) {
		const { search_url, search_fallback } = getConfig('@axium/ai');
		if (search_url) return (await searchSearXNG(search_url, query, page, signal)).slice(0, 10);

		switch (search_fallback) {
			case 'duckduckgo':
				return (await searchDuckDuckGo(query, page, signal)).slice(0, 10);
			case 'none':
				throw new Error('No search engine is configured');
		}
	},
});
