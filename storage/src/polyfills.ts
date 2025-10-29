/**
See:
https://developer.mozilla.org/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64
https://developer.mozilla.org/Web/JavaScript/Reference/Global_Objects/Uint8Array/toHex
https://github.com/microsoft/TypeScript/pull/61696
https://github.com/microsoft/TypeScript/issues/61695

@todo Remove when TypeScript 5.9 is released
*/

import { debug } from '@axium/core/node/io';

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
		fromBase64: (string: string) => Uint8Array;

		/**
		 * Creates a new `Uint8Array` from a base16-encoded string.
		 * @returns A new `Uint8Array` instance.
		 */
		fromHex: (string: string) => Uint8Array;
	}

	interface Uint8Array {
		/**
		 * Converts the `Uint8Array` to a base64-encoded string.
		 * @param options If provided, sets the alphabet and padding behavior used.
		 * @returns A base64-encoded string.
		 */
		toBase64: () => string;

		/**
		 * Sets the `Uint8Array` from a base64-encoded string.
		 * @param string The base64-encoded string.
		 * @param options If provided, specifies the alphabet and handling of the last chunk.
		 * @returns An object containing the number of bytes read and written.
		 * @throws {SyntaxError} If the input string contains characters outside the specified alphabet, or if the last
		 * chunk is inconsistent with the `lastChunkHandling` option.
		 */
		setFromBase64?: (string: string) => {
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

Uint8Array.fromHex ??=
	(debug('Using a polyfill of Uint8Array.fromHex'),
	function fromHex(this: Uint8Array, hex: string): Uint8Array {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < hex.length; i += 2) {
			bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
		}
		return bytes;
	});
