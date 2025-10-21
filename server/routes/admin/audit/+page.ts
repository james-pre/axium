import { fetchAPI } from '@axium/client/requests';
import { AuditFilter } from '@axium/core';
import { prettifyError, type input } from 'zod';

export const ssr = false;

const configured = await fetchAPI('OPTIONS', 'admin/audit/events').catch(() => false as const);

export async function load({ url }) {
	let filterError = null;
	try {
		AuditFilter.parse(Object.fromEntries(url.searchParams));
	} catch (e: any) {
		filterError = prettifyError(e);
	}

	const filter: input<typeof AuditFilter> = filterError ? {} : Object.fromEntries(url.searchParams);

	const events = await fetchAPI('GET', 'admin/audit/events', filter);

	return { events, filterError, filter, configured };
}
