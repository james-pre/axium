import type { App } from '@axium/core';
import { _unique } from './state.js';

export const apps = _unique('apps', new Map<string, App>());

export const appDisabledContent = {
	head: '<title>App Disabled</title>',
	body: '<h1>App Disabled</h1><p>This app is currently disabled.</p>',
};
