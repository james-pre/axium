import * as z from 'zod';

/** Whether `value` is a time zone known to this runtime, e.g. `America/Chicago` */
export function isTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/** An IANA time zone name, e.g. `America/Chicago` */
export const TimeZone = z.string().max(100).refine(isTimeZone, 'Unknown time zone');

/** The time zone the device running this code is set to */
export function deviceTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
