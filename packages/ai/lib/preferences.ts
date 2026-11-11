import * as ai from '@axium/ai/common';
import * as locales from '@james-pre/locales';
import * as z from 'zod';

/** The preferences schema, with the default model chosen from `models` by name */
export function preferencesSchema(models: ai.Model[]): z.ZodObject {
	if (!models.length) return ai.Preferences;

	const options: Record<string, string> = {};
	for (const model of models) options[model.name in options ? `${model.name} (${model.id})` : model.name] = model.id;

	return ai.Preferences.extend({ model: z.enum(options).optional() }).register(locales.zod, { prefix: 'ai.preferences' });
}
