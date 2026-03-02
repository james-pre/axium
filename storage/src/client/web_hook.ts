import { extendLocale } from '@axium/client';
import type {} from '@axium/client/locales';
import en from '../../locales/en.json' with { type: 'json' };
import '../common.js';

type en = typeof en;

declare module '@axium/client/locales' {
	interface Locale extends en {}
}

extendLocale('en', en);
