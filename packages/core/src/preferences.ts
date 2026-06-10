import type { ZodSerializable } from '@axium/core';
import * as z from 'zod';
import { zKeys } from './locales.js';

/** @internal Used so we can narrow using `type` and get access to type-specific properties (e.g. `ZodNumber.minValue`) */
export type ZodPref = Exclude<ZodSerializable, z.ZodPrefault>;

/**
 * @internal
 */
export let Preferences = z.object({
	debug: z.boolean().default(false).register(zKeys, { key: 'preference.debug' }),
});

/**
 * Interface for the user preferences schema shape.
 * Modify with `declare module ...`.
 */
export interface Preferences extends z.infer<typeof Preferences> {}

export function addPreference<T extends keyof Preferences = keyof Preferences>(name: T, schema: ZodPref) {
	Preferences = z.object({ ...Preferences.shape, [name]: schema });
}
