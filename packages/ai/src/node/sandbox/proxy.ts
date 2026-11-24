import * as io from 'ioium';
import * as http from 'node:http';
import * as net from 'node:net';
import type { Duplex } from 'node:stream';
import type * as ai from '../../common.js';
import { checkLiteral, publicLookup } from '../network.js';

/** Package registries and the hosts they download from. A leading dot matches subdomains. */
export const packageHosts = [
	// Python
	'pypi.org',
	'files.pythonhosted.org',
	'conda.anaconda.org',
	'repo.anaconda.com',
	// JavaScript
	'registry.npmjs.org',
	'registry.yarnpkg.com',
	// Rust
	'crates.io',
	'index.crates.io',
	'static.crates.io',
	// Go
	'proxy.golang.org',
	'sum.golang.org',
	// Ruby
	'rubygems.org',
	'index.rubygems.org',
	// Java
	'repo.maven.apache.org',
	'repo1.maven.org',
	// PHP, .NET, R
	'repo.packagist.org',
	'api.nuget.org',
	'cloud.r-project.org',
	// Linux distributions
	'deb.debian.org',
	'security.debian.org',
	'archive.ubuntu.com',
	'security.ubuntu.com',
	'dl-cdn.alpinelinux.org',
	'mirrors.fedoraproject.org',
	'dl.fedoraproject.org',
	// Source and release downloads used by many package managers
	'github.com',
	'codeload.github.com',
	'objects.githubusercontent.com',
	'release-assets.githubusercontent.com',
];

function isPackageHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/\.$/, '');
	return packageHosts.some(pattern => (pattern.startsWith('.') ? host.endsWith(pattern) : host == pattern));
}

const refusals = {
	packages:
		'The sandbox may only reach package registries. The user can allow all sites in their AI preferences under "Sandbox network access".',
	none: 'The sandbox has no network access. The user can allow package registries or all sites in their AI preferences under "Sandbox network access".',
};

/** Why a connection isn't allowed, or nothing when it is */
function refusal(policy: ai.SandboxNetwork, hostname: string): string | undefined {
	if (policy == 'all') return;
	if (policy == 'packages' && isPackageHost(hostname)) return;
	return refusals[policy];
}

function refuse(socket: Duplex, status: number, message: string): void {
	const body = message + '\n';
	socket.end(
		`HTTP/1.1 ${status} ${http.STATUS_CODES[status]}\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
	);
}

/** Headers only meant for the proxy */
const hopHeaders = ['proxy-authorization', 'proxy-connection', 'connection', 'keep-alive', 'te', 'trailer', 'upgrade'];

/**
 * An HTTP proxy on a Unix socket that only connects to public addresses allowed by `policy`.
 * Handles `CONNECT` tunnels for HTTPS and plain HTTP requests with absolute URLs.
 */
export async function startProxy(path: string, policy: ai.SandboxNetwork): Promise<http.Server> {
	const server = http.createServer((request, response) => {
		let url: URL;
		try {
			url = new URL(request.url ?? '');
			if (url.protocol != 'http:') throw new Error('Only http URLs can be proxied without CONNECT');
			checkLiteral(url.hostname);
		} catch (error) {
			response.writeHead(400, { 'Content-Type': 'text/plain' }).end(io.errorText(error) + '\n');
			return;
		}

		const refused = refusal(policy, url.hostname);
		if (refused) {
			response.writeHead(403, { 'Content-Type': 'text/plain' }).end(refused + '\n');
			return;
		}

		const headers = { ...request.headers };
		for (const name of hopHeaders) delete headers[name];

		const upstream = http.request(url, { method: request.method, headers, lookup: publicLookup }, upstreamResponse => {
			response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
			upstreamResponse.pipe(response);
		});
		upstream.on('error', error => {
			if (response.headersSent) response.destroy();
			else response.writeHead(502, { 'Content-Type': 'text/plain' }).end(io.errorText(error) + '\n');
		});
		request.pipe(upstream);
	});

	server.on('connect', (request: http.IncomingMessage, client: Duplex, head: Buffer) => {
		const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(request.url ?? '');
		if (!match) return refuse(client, 400, 'CONNECT needs a host and port');
		const [, hostname, portText] = match;
		const port = Number(portText);

		try {
			checkLiteral(hostname);
		} catch (error) {
			return refuse(client, 403, io.errorText(error));
		}

		const refused = refusal(policy, hostname);
		if (refused) return refuse(client, 403, refused);

		let connected = false;
		const upstream = net.connect({ host: hostname, port, lookup: publicLookup }, () => {
			connected = true;
			client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
			if (head.length) upstream.write(head);
			upstream.pipe(client);
			client.pipe(upstream);
		});
		upstream.on('error', error => {
			if (connected) client.destroy();
			else refuse(client, 502, io.errorText(error));
		});
		client.on('error', () => upstream.destroy());
	});

	server.on('clientError', (_, socket) => socket.destroy());

	const ready = Promise.withResolvers<void>();
	server.once('error', ready.reject);
	server.listen(path, () => ready.resolve());
	await ready.promise;

	return server;
}
