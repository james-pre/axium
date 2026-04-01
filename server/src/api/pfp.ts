import { sql } from 'kysely';
import { warn } from 'ioium/node';
import { execSync } from 'node:child_process';
import * as z from 'zod';
import { checkAuthForUser } from '../auth.js';
import { config } from '../config.js';
import { database as db } from '../database.js';
import { error, withError } from '../requests.js';
import { addRoute } from '../routes.js';

interface ImageMetadata {
	width: number;
	height: number;
}

let imageSize: ((input: Uint8Array) => ImageMetadata) | undefined;
try {
	const mod = await import('image-size');
	imageSize = mod.imageSize;
} catch {
	try {
		// Fall back to `identify` from ImageMagick
		execSync('command -v identify');

		imageSize = function identifyImageSize(input: Uint8Array): ImageMetadata {
			const stdout = execSync('identify -ping -format "%w %h" -', { input, timeout: 1000 });
			const [width, height] = stdout.toString().trim().split(' ').map(Number);
			return { width, height };
		};
	} catch {
		warn('Can not determine profile picture dimensions because neither image-size or ImageMagick is available');
	}
}

export interface ImageUploadConfig {
	enabled: boolean;
	/** Max size in KB */
	max_size: number;
	/** Max pixels per dimension */
	max_length: number;
}

export async function checkImageUpload(request: Request, cfg: ImageUploadConfig, userId: string) {
	const { enabled, max_size, max_length } = cfg;

	if (!enabled) error(503, 'Image uploads are disabled');

	await checkAuthForUser(request, userId);

	const type = request.headers.get('content-type');
	if (!type) error(400, 'Missing Content-Type header');
	if (!type.startsWith('image/')) error(415, 'Only image files are allowed');

	const size = Number(request.headers.get('content-length'));
	if (!Number.isSafeInteger(size)) error(400, 'Invalid Content-Length header');
	if (max_size && size / 1000 > max_size) error(413, `Image must be smaller than ${max_size} KB`);

	const data = await request.bytes();
	if (data.byteLength != size) error(400, 'Content-Length does not match actual data size');

	const { width, height } = imageSize?.(data) || { width: 0, height: 0 };
	if (imageSize && (!width || !height)) error(400, 'Invalid image dimensions');
	if (max_length && (width > max_length || height > max_length))
		error(413, `Image must be smaller than ${max_length}x${max_length} pixels`);

	return { data, type };
}

addRoute({
	path: '/raw/pfp/:id',
	params: { id: z.uuid() },
	async HEAD(request, { id: userId }) {
		const pfp = await db.selectFrom('profile_pictures').selectAll().where('userId', '=', userId).executeTakeFirst();

		if (!pfp) error(404, 'Profile picture not found');

		if (!pfp.isPublic) {
			try {
				await checkAuthForUser(request, userId);
			} catch (e) {
				if (!(e instanceof Error)) throw e;
				if (e.message == 'User ID mismatch') error(403, "User's profile picture is not public");
				throw e;
			}
		}

		return new Response(null, {
			headers: {
				'content-type': pfp.type,
				'content-length': pfp.data.length.toString(),
			},
		});
	},
	async GET(request, { id: userId }) {
		const pfp = await db.selectFrom('profile_pictures').selectAll().where('userId', '=', userId).executeTakeFirst();

		if (!pfp) error(404, 'Profile picture not found');

		if (!pfp.isPublic) {
			try {
				await checkAuthForUser(request, userId);
			} catch (e) {
				if (!(e instanceof Error)) throw e;
				if (e.message == 'User ID mismatch') error(403, "User's profile picture is not public");
				throw e;
			}
		}

		return new Response(pfp.data, {
			headers: {
				'content-type': pfp.type,
				'content-length': pfp.data.length.toString(),
			},
		});
	},
	async POST(request, { id: userId }) {
		const { data, type } = await checkImageUpload(request, config.user_pfp, userId);

		const { isInsert } = await db
			.insertInto('profile_pictures')
			.values({ userId, data, type })
			.onConflict(oc => oc.column('userId').doUpdateSet({ data, type }))
			.returning(sql<boolean>`xmax = 0`.as('isInsert'))
			.executeTakeFirstOrThrow()
			.catch(withError('Failed to upload profile picture', 500));

		return new Response(null, { status: isInsert ? 201 : 200 });
	},
	async DELETE(request, { id: userId }) {
		await checkAuthForUser(request, userId);

		const result = await db
			.deleteFrom('profile_pictures')
			.where('userId', '=', userId)
			.executeTakeFirst()
			.catch(withError('Failed to delete profile picture', 500));

		if (!result?.numDeletedRows) error(404, 'Profile picture not found');

		return new Response(null, { status: 204 });
	},
});
