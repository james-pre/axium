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
	| z.ZodArray<ZodPrefPrimitive>
	| z.ZodTuple<ZodPrefPrimitive[]>
	| z.ZodRecord<z.ZodString, ZodPrefPrimitive>
	| z.ZodObject<Readonly<Record<string, ZodPrefPrimitive>>>;

/** @internal Used so we can narrow using `type` and get access to type-specific properties (e.g. `ZodNumber.minValue`) */
export type ZodPref = ZodPrefComposite | z.ZodObject<Readonly<Record<string, ZodPrefComposite>>>;

/**
 * Interface for the user preferences schema shape.
 * Modify with `declare module ...`.
 */
export interface PreferenceSchemas {
	debug: z.ZodBoolean;
}

export type PreferenceName = keyof PreferenceSchemas & string;

/**
 * @internal
 */
export const preferenceSchemas = {
	debug: z.boolean(),
} as PreferenceSchemas;

export type Preferences = z.infer<z.ZodObject<Readonly<PreferenceSchemas>>>;

/**
 * @internal
 */
export const preferenceDefaults = {
	debug: false,
} as Preferences;

/**
 * @internal
 * @todo Implement proper localization
 */
export const preferenceLabels = {
	debug: 'Debug mode',
} as Record<PreferenceName, string>;

export const preferenceDescriptions = {} as Partial<Record<PreferenceName, string>>;

export interface PreferenceInit<T extends PreferenceName = PreferenceName> {
	name: T;
	schema: PreferenceSchemas[T] & ZodPref;
	initial: z.infer<PreferenceSchemas[T] & ZodPref>;
	label: string;
	descriptions?: string;
}

export function addPreference<T extends PreferenceName = PreferenceName>(init: PreferenceInit<T>) {
	preferenceSchemas[init.name] = init.schema;
	preferenceDefaults[init.name] = init.initial;
	preferenceLabels[init.name] = init.label;
	preferenceDescriptions[init.name] = init.descriptions;
}
