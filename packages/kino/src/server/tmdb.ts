import { getConfig } from '@axium/core';
import { TMDB } from 'tmdb-ts';

let api: TMDB;

export function tmdb(): TMDB {
	api ||= new TMDB(getConfig('@axium/kino').tmdb_api_key);
	return api;
}
