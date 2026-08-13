/**
 * Features are a special type of configuration. At idea is that they:
 * - Persist across instance restarts, but can be changed at runtime
 * - Are not inherently "hidden" from the user (e.g. how some plugin config options are for paths on the instance)
 * - Used to gate specific behavior or systems
 * - Can (but don't have to) be used for experimental or temporary stuff
 * @module
 */

import { warnOnce } from 'ioium';
import * as z from 'zod';

export const FeatureId = z.stringFormat('feature-id', /^[a-z][\w-]*$/i);

export const FeatureValues = z.record(FeatureId, z.boolean());

export const FeatureConfig = z.object({
	default: z.boolean(),
	/** Whether this feature can be enabled and disabled by regular users and is visible to them */
	user: z.boolean().default(false),
	experimental: z.boolean().default(false),
});
export interface FeatureConfigInit extends z.input<typeof FeatureConfig> {}
export interface FeatureConfig extends z.infer<typeof FeatureConfig> {}

export const FeatureState = z.object({
	...FeatureConfig.shape,
	/** Name of the plugin that defined this feature */
	from: z.string(),
	value: z.boolean(),
});
export interface FeatureState extends z.infer<typeof FeatureState> {}

/** @internal @hidden */
export const _featureBuiltinFrom = '<builtin>';

const features = new Map<string, FeatureState>();

export function addFeatures(config: Record<string, FeatureConfigInit>, from: string) {
	for (const [id, featureInit] of Object.entries(config ?? {})) {
		if (!FeatureId.safeParse(id).success) throw new SyntaxError('Invalid feature ID: ' + id);
		const feature = FeatureConfig.parse(featureInit);
		const existing = features.get(id);
		if (existing) warnOnce('Feature is defined by multiple plugins:', id, `(${existing.from}, ${from})`);
		features.set(id, { ...feature, from, value: feature.default });
	}
}

export function useFeatures(featuresInfo: Iterable<Feature>) {
	for (const feature of featuresInfo) features.set(feature.id, { ...feature });
}

export function setFeature(id: string, value: boolean, quiet: boolean = false) {
	const feature = features.get(id);
	if (!feature) throw new ReferenceError('Feature is not defined: ' + id);
	if (feature.value === value && !quiet) warnOnce('Feature is already', value ? 'enabled:' : 'disabled:', id);
	feature.value = value;
}

export const Feature = z.object({
	...FeatureState.shape,
	id: FeatureId,
});

export interface Feature extends z.infer<typeof Feature> {}

export function getFeature(id: string): Feature | undefined {
	const feature = features.get(id);
	if (!feature) return undefined;
	return { id, ...feature };
}

export function getFeatures(): IteratorObject<Feature> {
	return features.entries().map(([id, feature]) => ({ id, ...feature }));
}

export function feature(id: string): boolean {
	if (!features.has(id)) warnOnce('Feature is not defined:', id);
	return features.get(id)?.value ?? false;
}
