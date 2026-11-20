import { createHmac, timingSafeEqual } from 'node:crypto';
import { decodeUTF8, encodeUTF8 } from 'utilium';

function base64url(bytes: Uint8Array): string {
	return bytes.toBase64({ alphabet: 'base64url', omitPadding: true });
}

const header = base64url(encodeUTF8(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

function signature(signingInput: string, secret: string): Uint8Array {
	return createHmac('sha256', secret).update(signingInput).digest();
}

/** Signs `payload` with HS256 */
export function sign(payload: object, secret: string): string {
	const signingInput = `${header}.${base64url(encodeUTF8(JSON.stringify(payload)))}`;
	return `${signingInput}.${base64url(signature(signingInput, secret))}`;
}

/** Returns the payload of an HS256 token with a valid signature that has not expired, or null */
export function verify<T extends object>(token: string, secret: string): (T & { exp?: number }) | null {
	if (!secret) return null;

	const [tokenHeader, body, tokenSignature, ...extra] = token.split('.');
	if (!tokenHeader || !body || !tokenSignature || extra.length) return null;

	const expected = signature(`${tokenHeader}.${body}`, secret);
	const actual = Uint8Array.fromBase64(tokenSignature, { alphabet: 'base64url' });
	if (actual.length != expected.length || !timingSafeEqual(actual, expected)) return null;

	try {
		if (JSON.parse(decodeUTF8(Uint8Array.fromBase64(tokenHeader, { alphabet: 'base64url' }))).alg != 'HS256') return null;

		const payload = JSON.parse(decodeUTF8(Uint8Array.fromBase64(body, { alphabet: 'base64url' })));
		if (typeof payload.exp == 'number' && payload.exp * 1000 < Date.now()) return null;
		return payload;
	} catch {
		return null;
	}
}
