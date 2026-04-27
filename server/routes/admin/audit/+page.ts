import { fetchAPI } from '@axium/client/requests';
import { AuditFilter } from '@axium/core';
import { prettifyError, type input } from 'zod';

export const ssr = false;

const configured = await fetchAPI('OPTIONS', 'admin/audit/events').catch(() => false as const);

export async function load({ url }) {
	let filterError = null,
		filter: input<typeof AuditFilter> = {};
	try {
		filter = AuditFilter.parse(Object.fromEntries(url.searchParams));
	} catch (e: any) {
		filterError = prettifyError(e);
	}

	const events = await fetchAPI('GET', 'admin/audit/events', filter);

	return { events, filterError, filter, configured };
}
