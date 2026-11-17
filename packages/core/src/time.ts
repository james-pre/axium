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

/** Whether `value` is an ISO 8601 date and time with a UTC offset */
export function isInstant(value: string): boolean {
	try {
		Temporal.Instant.from(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * An ISO 8601 date and time with a UTC offset, with or without seconds, e.g. `2026-11-16T15:30-06:00`
 * @see https://github.com/colinhacks/zod/pull/5961
 * @todo Remove once Zod has proper Temporal support built-in
 */
export const Instant = z.string().max(100).refine(isInstant, 'Expected a date and time with a UTC offset');
