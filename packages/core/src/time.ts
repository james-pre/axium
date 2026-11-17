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

/** The canonical time zones this runtime knows, for choosing one */
export const timeZones = ['UTC', ...Intl.supportedValuesOf('timeZone')];

/** A time zone chosen from {@link timeZones}, also accepting other names the runtime knows, e.g. aliases reported by devices */
export const TimeZoneChoice = z.union([z.literal(timeZones), TimeZone]);
