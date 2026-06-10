import { debug } from 'ioium';

/* eslint-disable @typescript-eslint/unbound-method */

Uint8Array.prototype.toHex ??=
	(debug('Using a polyfill of Uint8Array.prototype.toHex'),
	function toHex(this: Uint8Array): string {
		return [...this].map(b => b.toString(16).padStart(2, '0')).join('');
	});

Uint8Array.prototype.toBase64 ??=
	(debug('Using a polyfill of Uint8Array.prototype.toBase64'),
	function toBase64(this: Uint8Array, options: { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean } = {}): string {
		let base64 = btoa(String.fromCharCode(...this));
		if (options.omitPadding) base64 = base64.replaceAll('=', '');
		if (options.alphabet == 'base64url') base64 = base64.replaceAll('+', '-').replaceAll('/', '_');
		return base64;
	});

Uint8Array.fromHex ??=
	(debug('Using a polyfill of Uint8Array.fromHex'),
	function fromHex(hex: string): Uint8Array<ArrayBuffer> {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < hex.length; i += 2) {
			bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
		}
		return bytes;
	});

Uint8Array.fromBase64 ??=
	(debug('Using a polyfill of Uint8Array.fromBase64'),
	function fromBase64(base64: string, options?: Parameters<Uint8ArrayConstructor['fromBase64']>[1]): Uint8Array<ArrayBuffer> {
		if (options?.alphabet == 'base64url') base64 = base64.replaceAll('-', '+').replaceAll('_', '/');
		const lastChunkBytes = base64.length % 4; // # bytes in last chunk if it is partial
		switch (options?.lastChunkHandling) {
			case 'loose':
				if (lastChunkBytes) base64 += '='.repeat(4 - lastChunkBytes);
				break;
			case 'strict':
				if (lastChunkBytes) throw new SyntaxError('unexpected incomplete base64 chunk');
				break;
			case 'stop-before-partial':
				if (!lastChunkBytes) break;
				if (lastChunkBytes == 2 && base64.at(-1) == '=' && base64.at(-2) != '=')
					throw new SyntaxError('unexpected incomplete base64 chunk');
				base64 = base64.slice(0, -lastChunkBytes);
		}
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	});
