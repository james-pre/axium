import type { Session } from '@axium/core';
import type { UploadConfig, UploadInit } from '@axium/core/uploads';
import { createHash, randomBytes, type Hash } from 'node:crypto';
import { copyFileSync, createWriteStream, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { requireSession } from './auth.js';
import { error } from './requests.js';
import { audit } from './audit.js';
import { pick } from 'utilium';
import { addRoute } from './routes.js';

/**
 * Information about an ongoing upload
 */
export interface Upload<Init extends UploadInit = UploadInit, Data = null | undefined> {
	file: string;
	stream: WritableStream;
	hash: Hash;
	uploadedBytes: bigint;
	sessionId: string;
	userId: string;
	/** User provided */
	init: Init;
	/** Application provided */
	data: Data;

	/**
	 * Remove the upload from pending and clean up resources
	 * @param isSuccess whether the upload was successful. If not, abort-style behavior will be used instead.
	 */
	remove(isSuccess?: boolean): void;
}

/**
 * Result of uploading the final chunk in an upload
 */
export interface UploadChunkFinal<Init extends UploadInit = UploadInit, Data = null | undefined>
	extends Disposable, Pick<Upload<Init, Data>, 'file' | 'init' | 'data' | 'userId'> {
	hash: Uint8Array<ArrayBuffer>;
	done: true;
	aborted?: false;
	writeTo(this: void, path: string): void;
}

/**
 * Result of uploading a chunk that isn't the final one
 */
export interface UploadChunkProgress extends Disposable {
	done?: false;
	aborted?: boolean;
}

export type UploadChunkResult<Init extends UploadInit = UploadInit, Data = null | undefined> =
	| UploadChunkFinal<Init, Data>
	| UploadChunkProgress;

export interface UploadSuccessCallback<T, Init extends UploadInit = UploadInit, Data = undefined> {
	(upload: UploadChunkFinal<Init, Data>): T | Promise<T>;
}

/**
 * Manages chunked uploads
 */
export class UploadManager<Init extends UploadInit = UploadInit, Data = null | undefined> extends Map<string, Upload<Init, Data>> {
	get config() {
		return typeof this._config == 'function' ? this._config() : this._config;
	}

	constructor(protected readonly _config: UploadConfig | (() => UploadConfig)) {
		super();
	}

	start(init: Init, session: Session, data: Data): string {
		const token = randomBytes(32),
			tokenB64 = token.toBase64({ alphabet: 'base64url', omitPadding: true });

		mkdirSync(this.config.temp_dir, { recursive: true });
		const file = join(this.config.temp_dir, token.toHex());

		let removed = false;

		const remove = (isSuccess: boolean = false) => {
			if (removed) return;
			removed = true;
			this.delete(tokenB64);
			if (isSuccess) void stream.close();
			else void stream.abort();
			hash.end();
			try {
				unlinkSync(file);
			} catch {
				// probably renamed
			}
		};

		const hash = createHash('BLAKE2b512'),
			stream = Writable.toWeb(createWriteStream(file));

		this.set(tokenB64, {
			hash,
			file,
			stream,
			uploadedBytes: 0n,
			sessionId: session.id,
			userId: session.userId,
			init,
			data,
			remove,
		});

		setTimeout(() => {
			remove();
		}, this.config.timeout * 60_000);

		return tokenB64;
	}

	async require(request: Request): Promise<Upload<Init, Data>> {
		const token = request.headers.get('x-upload');
		if (!token) error(401, 'Missing upload token');
		const upload = this.get(token);
		if (!upload) error(400, 'Invalid upload token');

		const session = await requireSession(request);

		if (session.id != upload.sessionId) error(403, 'Upload does not belong to the current session');
		if (session.userId != upload.userId) error(403, 'Upload does not belong to the current user');

		return upload;
	}

	/**
	 * Add a chunk to an existing upload.
	 * `using` ***must*** be used to make sure that the upload information is cleaned up for the final chunk.
	 *
	 * @example
	 * ```ts
	 * using upload = await uploads.addChunk(request);
	 *
	 * if (upload.aborted) return;
	 * if (!upload.done) return new Response(null, { status: 204 });
	 *
	 * // upload done, persist it to the FS and/or DB
	 * ```
	 */
	async addChunk(request: Request): Promise<UploadChunkResult<Init, Data>> {
		const upload = await this.require(request);

		const size = BigInt(request.headers.get('x-chunk-size') || -1);

		if (size < 0n) error(411, 'Missing or invalid chunk size');

		if (upload.uploadedBytes + size > upload.init.size) error(413, 'Upload exceeds allowed size');

		const offset = BigInt(request.headers.get('x-offset') || -1);
		if (offset != upload.uploadedBytes) error(400, `Expected offset ${upload.uploadedBytes} but got ${offset}`);

		if (!request.body) error(400, 'Missing request body');

		let actualSize = 0n;
		const counter = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
			transform(chunk, controller) {
				actualSize += BigInt(chunk.length);
				upload.hash.update(chunk);
				controller.enqueue(chunk);
			},
		});

		const progressResult = (aborted?: boolean) => ({
			aborted,
			done: false as const,
			[Symbol.dispose]() {},
		});

		try {
			await request.body.pipeThrough(counter).pipeTo(upload.stream, { preventClose: true });
		} catch (e) {
			upload.remove();
			if (request.signal.aborted) return progressResult(true);
			throw e;
		}

		// A short chunk means the request was aborted mid-transfer, e.g. the user cancelled the upload
		if (request.signal.aborted || actualSize < size) {
			upload.remove();
			return progressResult(true);
		}

		if (actualSize != size) {
			upload.remove();
			await audit('upload_size_mismatch', upload.userId, { expected: size, actual: actualSize });
			error(400, `Content length mismatch: expected ${size}, got ${actualSize}`);
		}

		upload.uploadedBytes += actualSize;

		if (upload.uploadedBytes != upload.init.size) return progressResult(false);

		const hash = upload.hash.digest();
		upload.init.hash ??= hash.toHex();
		if (hash.toHex() != upload.init.hash) error(409, 'Hash mismatch');

		const writeTo = (path: string) => {
			try {
				renameSync(upload.file, path);
			} catch (e: any) {
				if (e.code != 'EXDEV') throw e;
				copyFileSync(upload.file, path);
			}
		};

		return {
			...pick(upload, 'init', 'data', 'file', 'userId'),
			hash,
			done: true,
			writeTo,
			[Symbol.dispose]() {
				upload.remove(true);
			},
		};
	}

	/**
	 * Add an endpoint for uploading chunks of an already accepted upload
	 */
	addEndpoint<T>(path: string, onSuccess: UploadSuccessCallback<T, Init, Data>): void {
		const uploads = this;

		addRoute({
			path,
			async POST(request) {
				using upload = await uploads.addChunk(request);

				if (upload.aborted) return;
				if (!upload.done) return new Response(null, { status: 204 });

				return await onSuccess(upload);
			},
			async DELETE(request): Promise<Response> {
				const upload = await uploads.require(request);

				upload.remove();

				return new Response(null, { status: 204 });
			},
		});
	}
}
