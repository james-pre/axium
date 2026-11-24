import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The vsock port guests reach the host's proxy at, which the guest's forwarder also listens on */
export const proxyPort = 3128;

/** Where the guest's forwarder listens, for `HTTP_PROXY` */
export const proxyAddress = 'http://127.0.0.1:' + proxyPort;

/** The user commands run as in the guest */
export const guestUser = 1000;

interface GuestFiles {
	init: string;
	forward: string;
	extract: string;
}

let files: GuestFiles | undefined;

/** The scripts in the package's `guest` folder */
export function guestFiles(): GuestFiles {
	files ??= {
		init: readFileSync(join(import.meta.dirname, '../../../guest/init.sh'), 'utf8'),
		forward: readFileSync(join(import.meta.dirname, '../../../guest/forward.py'), 'utf8'),
		extract: readFileSync(join(import.meta.dirname, '../../../guest/extract.sh'), 'utf8'),
	};
	return files;
}
