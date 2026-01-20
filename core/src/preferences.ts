import * as z from 'zod';

/** @internal Used so we can narrow using `type` and get access to type-specific properties (e.g. `ZodNumber.minValue`) */
type StringFormatTypes =
	| z.ZodGUID
	| z.ZodUUID
	| z.ZodEmail
	| z.ZodURL
	| z.ZodEmoji
	| z.ZodNanoID
	| z.ZodCUID
	| z.ZodCUID2
	| z.ZodULID
	| z.ZodXID
	| z.ZodKSUID
	| z.ZodISODateTime
	| z.ZodISODate
	| z.ZodISOTime
	| z.ZodISODuration
	| z.ZodIPv4
	| z.ZodIPv6
	| z.ZodCIDRv4
	| z.ZodCIDRv6
	| z.ZodBase64
	| z.ZodBase64URL
	| z.ZodE164
	| z.ZodJWT;

type ZodPrefPrimitive =
	| z.ZodString
	| z.ZodNumber
	| z.ZodBigInt
	| z.ZodBoolean
	| z.ZodDate
	| z.ZodLiteral
	| z.ZodTemplateLiteral
	| z.ZodFile
	| z.ZodEnum
	| StringFormatTypes;

type ZodPrefComposite =
	| ZodPrefPrimitive
	| z.ZodNullable<ZodPrefPrimitive>
	| z.ZodOptional<ZodPrefPrimitive>
	| z.ZodDefault<ZodPrefPrimitive>
	| z.ZodArray<ZodPrefPrimitive>
	| z.ZodTuple<ZodPrefPrimitive[]>
	| z.ZodRecord<z.ZodString, ZodPrefPrimitive>
	| z.ZodObject<Readonly<Record<string, ZodPrefPrimitive>>>;

/** @internal Used so we can narrow using `type` and get access to type-specific properties (e.g. `ZodNumber.minValue`) */
export type ZodPref = ZodPrefComposite | z.ZodObject<Readonly<Record<string, ZodPrefComposite>>>;

/**
 * @internal
 */
export let Preferences = z.object({
	debug: z.boolean().default(false),
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
