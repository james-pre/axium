/**
 * Browser-side feature state.
 *
 * Enabled feature IDs are listed in a single `feature` attribute on `<html>`, so CSS selects them with the `~=` operator
 *
 * @example
 * ```css
 * [feature~='checkbox-switch'] {
 * 	input[type='checkbox'] { ... }
 * }
 * ```
 *
 * @module
 */

import { getAll, set, use } from '@axium/core/features';
import { fetchAPI } from '../requests.js';

function _setFeatureAttributes() {
	const enabled = getAll()
		.filter(f => f.value)
		.map(f => f.id)
		.toArray();

	if (enabled.length) document.documentElement.setAttribute('feature', enabled.join(' '));
	else document.documentElement.removeAttribute('feature');
}

export async function loadFeatures(userId?: string): Promise<void> {
	const features = userId
		? await fetchAPI('GET', 'users/:id/features', {}, userId).catch(() => fetchAPI('GET', 'features'))
		: await fetchAPI('GET', 'features');

	use(features);
	_setFeatureAttributes();
}

export async function setUserFeatures(userId: string, update: Record<string, boolean>): Promise<Record<string, boolean>> {
	const values = await fetchAPI('POST', 'users/:id/features', update, userId);
	for (const [id, value] of Object.entries(values)) set(id, value);
	_setFeatureAttributes();
	return values;
}

export async function setGlobalFeatures(update: Record<string, boolean>): Promise<Record<string, boolean>> {
	const values = await fetchAPI('POST', 'features', update);
	for (const [id, value] of Object.entries(values)) set(id, value);
	_setFeatureAttributes();
	return values;
}
