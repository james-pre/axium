import { prepareImageUpload } from '@axium/server/api/images';
import { checkAuthForUser } from '@axium/server/auth';
import { database } from '@axium/server/database';
import { error, withError } from '@axium/server/requests';
import { addRoute } from '@axium/server/routes';
import { sql } from 'kysely';
import * as z from 'zod';

addRoute({
	path: '/raw/contacts/pfp/:id',
	params: { id: z.uuid() },
	async HEAD(request, { id }) {
		const { userId } = await database
			.selectFrom('contacts')
			.select('userId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Contact does not exist', 404));

		await checkAuthForUser(request, userId);

		const pfp = await database.selectFrom('contact_pictures').selectAll().where('contactId', '=', id).executeTakeFirst();
		if (!pfp) error(404, 'Contact picture not found');

		return new Response(null, {
			headers: {
				'content-type': pfp.type,
				'content-length': pfp.data.length.toString(),
			},
		});
	},
	async GET(request, { id }) {
		const { userId } = await database
			.selectFrom('contacts')
			.select('userId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Contact does not exist', 404));

		const pfp = await database.selectFrom('contact_pictures').selectAll().where('contactId', '=', id).executeTakeFirst();
		if (!pfp) error(404, 'Contact picture not found');

		await checkAuthForUser(request, userId);

		return new Response(pfp.data, {
			headers: {
				'content-type': pfp.type,
				'content-length': pfp.data.length.toString(),
			},
		});
	},
	async POST(request, { id }) {
		const { userId } = await database
			.selectFrom('contacts')
			.select('userId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Contact does not exist', 404));

		const { data, type } = await prepareImageUpload(request, { enabled: true, max_size: 500, max_length: 500 }, userId);

		const { isInsert } = await database
			.insertInto('contact_pictures')
			.values({ contactId: id, data, type })
			.onConflict(oc => oc.column('contactId').doUpdateSet({ data, type }))
			.returning(sql<boolean>`xmax = 0`.as('isInsert'))
			.executeTakeFirstOrThrow()
			.catch(withError('Failed to upload contact picture', 500));

		return new Response(null, { status: isInsert ? 201 : 200 });
	},
	async DELETE(request, { id }) {
		const { userId } = await database
			.selectFrom('contacts')
			.select('userId')
			.where('id', '=', id)
			.executeTakeFirstOrThrow()
			.catch(withError('Contact does not exist', 404));

		await checkAuthForUser(request, userId);

		const result = await database
			.deleteFrom('contact_pictures')
			.where('contactId', '=', id)
			.executeTakeFirst()
			.catch(withError('Failed to delete contact picture', 500));

		if (!result?.numDeletedRows) error(404, 'Contact picture not found');

		return new Response(null, { status: 204 });
	},
});
