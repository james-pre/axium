import { getConfig } from '@axium/core';
import { count } from '@axium/server/database';
import { mkdirSync } from 'node:fs';
import '../common.js';
import './api/metadata.js';
import './api/raw.js';
import './api/search.js';
import './api/upload.js';
import './images.js';

export function load() {
	const { data_dir, images } = getConfig('@axium/kino');
	mkdirSync(data_dir, { recursive: true });
	mkdirSync(images.cache.directory, { recursive: true });
}

export async function statusText(): Promise<string> {
	const { kino_movie_uploads: movies, kino_tv_uploads: episodes } = await count('kino_movie_uploads', 'kino_tv_uploads');

	return `${movies} movies and ${episodes} episodes`;
}
