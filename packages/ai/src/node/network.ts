import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/** Addresses the model may not reach, so it can't be used to probe the server's network */
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

/** Whether an address is private or reserved. Anything that isn't an IP address counts as blocked. */
export function isBlocked(address: string): boolean {
	const family = isIP(address);
	return !family || blocked.check(address, family == 6 ? 'ipv6' : 'ipv4');
}

/** Resolves like `dns.lookup`, but fails for private and reserved addresses */
export const publicLookup = ((hostname: string, options: LookupOptions, callback: (...args: any[]) => void) => {
	dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
		if (error) return callback(error);
		if (!addresses.length || addresses.some(entry => isBlocked(entry.address))) {
			return callback(new Error(`${hostname} resolves to a private or reserved address`));
		}
		if (options.all) callback(null, addresses);
		else callback(null, addresses[0].address, addresses[0].family);
	});
}) as LookupFunction;

/** Throws if `hostname` is an IP address literal that is private or reserved */
export function checkLiteral(hostname: string): void {
	const literal = hostname.replace(/^\[|\]$/g, '');
	if (isIP(literal) && isBlocked(literal)) throw new Error(`${literal} is a private or reserved address`);
}
