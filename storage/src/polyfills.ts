/**
See:
https://developer.mozilla.org/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64
https://developer.mozilla.org/Web/JavaScript/Reference/Global_Objects/Uint8Array/toHex
https://github.com/microsoft/TypeScript/pull/61696
https://github.com/microsoft/TypeScript/issues/61695

@todo Remove when TypeScript 5.9 is released
*/

import { debug } from '@axium/core/io';

interface FromBase64Options {
	alphabet?: 'base64' | 'base64url';
	lastChunkHandling?: 'loose' | 'strict' | 'stop-before-partial';
}

declare global {
	interface Uint8ArrayConstructor {
		/**
		 * Creates a new `Uint8Array` from a base64-encoded string.
		 * @param string The base64-encoded string.
		 * @param options If provided, specifies the alphabet and handling of the last chunk.
		 * @returns A new `Uint8Array` instance.
		 * @throws {SyntaxError} If the input string contains characters outside the specified alphabet, or if the last
		 * chunk is inconsistent with the `lastChunkHandling` option.
		 */
		fromBase64: (string: string, options?: FromBase64Options) => Uint8Array<ArrayBuffer>;

		/**
		 * Creates a new `Uint8Array` from a base16-encoded string.
		 * @returns A new `Uint8Array` instance.
		 */
		fromHex: (string: string) => Uint8Array<ArrayBuffer>;
	}

	interface Uint8Array {
		/**
		 * Converts the `Uint8Array` to a base64-encoded string.
		 * @param options If provided, sets the alphabet and padding behavior used.
		 * @returns A base64-encoded string.
		 */
		toBase64: (options?: { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean }) => string;

		/**
		 * Sets the `Uint8Array` from a base64-encoded string.
		 * @param string The base64-encoded string.
		 * @param options If provided, specifies the alphabet and handling of the last chunk.
		 * @returns An object containing the number of bytes read and written.
		 * @throws {SyntaxError} If the input string contains characters outside the specified alphabet, or if the last
		 * chunk is inconsistent with the `lastChunkHandling` option.
		 */
		setFromBase64?: (
			string: string,
			options?: FromBase64Options
		) => {
			read: number;
			written: number;
		};

		/**
		 * Converts the `Uint8Array` to a base16-encoded string.
		 * @returns A base16-encoded string.
		 */
		toHex: () => string;

		/**
		 * Sets the `Uint8Array` from a base16-encoded string.
		 * @param string The base16-encoded string.
		 * @returns An object containing the number of bytes read and written.
		 */
		setFromHex?: (string: string) => {
			read: number;
			written: number;
		};
	}
}

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
	function fromBase64(base64: string, options?: FromBase64Options): Uint8Array<ArrayBuffer> {
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
