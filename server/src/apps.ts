import { _unique } from './state.js';
import type { AppMetadata } from '@axium/core';

export interface App extends AppMetadata {}

export const apps = _unique('apps', new Map<string, App>());

export function addApp(init: AppMetadata) {
	if (apps.has(init.id)) throw new ReferenceError(`App with ID "${init.id}" already exists.`);
	apps.set(init.id, init);
}

export const appDisabledContent = {
	head: '<title>App Disabled</title>',
	body: '<h1>App Disabled</h1><p>This app is currently disabled.</p>',
};
