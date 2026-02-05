import type { Snippet } from 'svelte';
import type { StorageItemMetadata } from '../common.js';

export default new Map<string, Snippet<[item: StorageItemMetadata]>>();
