import { debug } from 'ioium';
import { sql } from 'kysely';
import sharp from 'sharp';
import * as z from 'zod';
import { checkAuthForUser } from '../auth.js';
import { config, type ImageUploadConfig } from '../config.js';
import { database as db } from '../database.js';
import { error, withError } from '../requests.js';
import { addRoute } from '../routes.js';

export interface PreparedImageUpload {
	data: Uint8Array<ArrayBuffer>;
	type: string;
}

export async function prepareImageUpload(request: Request, cfg: ImageUploadConfig, userId: string): Promise<PreparedImageUpload> {
	const { enabled, max_size, max_length } = cfg;

	if (!enabled) error(503, 'Image uploads are disabled');

	await checkAuthForUser(request, userId);

	const type = request.headers.get('content-type');
	if (!type) error(400, 'Missing Content-Type header');
	if (!type.startsWith('image/')) error(415, 'Only image files are allowed');

	const contentLength = Number(request.headers.get('content-length'));
	if (!Number.isSafeInteger(contentLength)) error(400, 'Invalid Content-Length header');

	const rawData = await request.bytes();
	if (rawData.byteLength != contentLength) error(400, 'Content-Length does not match actual data size');

	const { data, info } = await sharp(rawData)
		.autoOrient()
		.timeout({ seconds: 10 })
		.resize({ width: max_length, height: max_length, fit: 'cover', withoutEnlargement: true })
		.toBuffer({ resolveWithObject: true });

	const { width, height, size } = info;

	if (!width || !height) error(400, 'Invalid image dimensions');

	debug(`Prepared image upload: ${Math.round(size / 1000)}KB @ ${width}x${height}`);

	if (max_size && size / 1000 > max_size) error(413, `Image must be smaller than ${max_size} KB (got ${Math.round(size / 1000)} KB)`);
	if (max_length && (width > max_length || height > max_length)) {
		error(413, `Image must be smaller than ${max_length}x${max_length} pixels`);
	}

	if (!(data.buffer instanceof ArrayBuffer)) error(500, 'Unexpectedly got a shared buffer from sharp.');
	return { data: data as Uint8Array<ArrayBuffer>, type };
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
		const { data, type } = await prepareImageUpload(request, config.user_pfp, userId);

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
