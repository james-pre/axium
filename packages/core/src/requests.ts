export const requestMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'] as const;

export type RequestMethod = (typeof requestMethods)[number];

/** The response header that carries warnings about an API request */
export const warningsHeader = 'X-Axium-Warnings';

/** Encodes warnings as a header value, which must stay ASCII */
export function encodeWarnings(warnings: string[]): string {
	return warnings.map(encodeURIComponent).join(',');
}

export function decodeWarnings(header: string | null): string[] {
	if (!header) return [];
	return header.split(',').map(decodeURIComponent);
}
