/**
 * Features are a special type of configuration. At idea is that they:
 * - Persist across instance restarts, but can be changed at runtime
 * - Are not inherently "hidden" from the user (e.g. how some plugin config options are for paths on the instance)
 * - Used to gate specific behavior or systems
 * - Can (but don't have to) be used for experimental or temporary stuff
 * @module
 */

import { error, errorText, warnOnce } from 'ioium';
import * as z from 'zod';

export const Id = z.stringFormat('feature-id', /^[a-z][\w-]*$/i);

export const Values = z.record(Id, z.boolean());

export const Config = z.object({
	default: z.boolean(),
	/** Whether this feature can be enabled and disabled by regular users and is visible to them */
	user: z.boolean().default(false),
	experimental: z.boolean().default(false),
});
export interface ConfigInit extends z.input<typeof Config> {}
export interface Config extends z.infer<typeof Config> {}

export const State = z.object({
	...Config.shape,
	/** Name of the plugin that defined this feature */
	from: z.string(),
	value: z.boolean(),
});
export interface State extends z.infer<typeof State> {}

/** @internal @hidden */
export const _builtinFrom = '<builtin>';

const features = new Map<string, State>();

export function add(config: Record<string, ConfigInit>, from: string) {
	for (const [id, featureInit] of Object.entries(config ?? {})) {
		if (!Id.safeParse(id).success) throw new SyntaxError('Invalid feature ID: ' + id);
		const feature = Config.parse(featureInit);
		const existing = features.get(id);
		if (existing) warnOnce('Feature is defined by multiple plugins:', id, `(${existing.from}, ${from})`);
		features.set(id, { ...feature, from, value: feature.default });
	}
}

add(
	{
		// Indicator that an input is experimental, derived from `ZodLocaleInfo.experimental`
		'zod-experimental-input-indicator': { default: false, experimental: true },
		'zod-default-handling': { default: false, experimental: true },
		// Use a "switch" instead of a checkbox
		'input-checkbox-as-switch': { default: false, experimental: true },
		themes: { default: false, experimental: true },
	},
	_builtinFrom
);

export function use(featuresInfo: Iterable<Feature>) {
	for (const feature of featuresInfo) features.set(feature.id, { ...feature });
}

export function set(id: string, value: boolean, quiet: boolean = false) {
	const feature = features.get(id);
	if (!feature) throw new ReferenceError('Feature is not defined: ' + id);
	if (feature.value === value && !quiet) warnOnce('Feature is already', value ? 'enabled:' : 'disabled:', id);
	feature.value = value;
	save();
}

export const Feature = z.object({
	...State.shape,
	id: Id,
});

export interface Feature extends z.infer<typeof Feature> {}

export function get(id: string): Feature | undefined {
	const feature = features.get(id);
	if (!feature) return undefined;
	return { id, ...feature };
}

export function getAll(): IteratorObject<Feature> {
	return features.entries().map(([id, feature]) => ({ id, ...feature }));
}

export function value(id: string): boolean {
	if (!features.has(id)) warnOnce('Feature is not defined:', id);
	return features.get(id)?.value ?? false;
}

export default value;

export function toValues(): Record<string, boolean> {
	return Object.fromEntries(features.entries().map(([id, feature]) => [id, feature.value]));
}

export function reset(id: string) {
	const feature = features.get(id);
	if (!feature) throw new ReferenceError('Feature is not defined: ' + id);
	feature.value = feature.default;
	save();
}

export function resetAll() {
	for (const feature of features.values()) feature.value = feature.default;
	try {
		_save({});
	} catch (e: any) {
		error('Could not reset feature flag values:', errorText(e));
	}
}

function save() {
	const values = Object.fromEntries(
		features
			.entries()
			.filter(([, feature]) => feature.value !== feature.default)
			.map(([id, feature]) => [id, feature.value])
	);
	try {
		_save(values);
	} catch (e: any) {
		error('Could not save feature flag values:', errorText(e));
	}
}

let _save: (values: Record<string, boolean>) => void = () => {};

export function persist(existingValues: Record<string, boolean>, save: (values: Record<string, boolean>) => void) {
	_save = save;
	for (const [id, value] of Object.entries(existingValues)) {
		const feature = features.get(id);
		if (feature) feature.value = value;
		else warnOnce('Feature is not defined: ' + id);
	}
}
