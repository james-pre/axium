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

/**
 * @internal
 * @todo Implement proper localization
 */
export const preferenceLabels = {
	debug: 'Debug mode',
} as Record<keyof Preferences, string>;

export const preferenceDescriptions = {} as Partial<Record<keyof Preferences, string>>;

export interface PreferenceInit<T extends keyof Preferences = keyof Preferences, S extends ZodPref = ZodPref> {
	name: T;
	schema: S;
	label: string;
	descriptions?: string;
}

export function addPreference<T extends keyof Preferences = keyof Preferences>(init: PreferenceInit<T>) {
	Preferences = z.object({ ...Preferences.shape, [init.name]: init.schema });
	preferenceLabels[init.name] = init.label;
	preferenceDescriptions[init.name] = init.descriptions;
}
