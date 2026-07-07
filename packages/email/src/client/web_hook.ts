import { extendLocale, text } from '@axium/client';
import type {} from '@axium/client/locales';
import { addListener, connect } from '@axium/client/socket';
import { toast } from '@axium/client/toast';
import en from '../../locales/en.json' with { type: 'json' };
import '../common.js';

type en = typeof en;

declare module '@axium/client/locales' {
	interface Locale extends en {}
}

await connect().catch(() => null);

extendLocale('en', en);

addListener('email.received', email => {
	if (email.folder != 'spam') void toast('info', text('email.toast_received', { name: email.from.name || email.from.address }));
});
