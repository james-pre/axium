import serverConfig from '@axium/server/config';
import { existsSync, readFileSync } from 'node:fs';
import tls from 'node:tls';
import './common.js';
import './server/api.js';

/** Trusts the certificate Axium serves with, which a self-hosted document server may share */
export function load(): void {
	const { ssl_cert } = serverConfig.web;
	if (!existsSync(ssl_cert)) return;
	tls.setDefaultCACertificates([...tls.getCACertificates('default'), readFileSync(ssl_cert, 'utf8')]);
}
