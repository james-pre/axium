import type { Snippet } from 'svelte';
import type { StorageItemMetadata } from '../common.js';

export const previews = new Map<string, Snippet<[item: StorageItemMetadata]>>();

export interface Opener {
	/** Mime types supported by this opener */
	types: string[];

	name: string;

	/** Get a URL to open the item with another plugin */
	openURL(item: StorageItemMetadata): string;
}

export const openers: Opener[] = [];
