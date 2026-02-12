import { decodeUUID } from 'utilium';
import '@axium/storage/polyfills';

export const ssr = false;

export async function load({ params }) {
	const uuid = decodeUUID(Uint8Array.fromBase64(params.id, { alphabet: 'base64url' }));
	location.href = '/files/' + uuid;
}
