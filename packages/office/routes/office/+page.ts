import { formatOf } from '@axium/office/common';
import { getUserStorage, itemsSharedWith } from '@axium/storage/client';

export async function load({ parent }) {
	const { session } = await parent();

	const [owned, shared] = await Promise.all([getUserStorage(session.userId), itemsSharedWith(session.userId)]);

	const items = [...owned.items, ...shared]
		.filter(item => !item.trashedAt && item.type != 'inode/directory' && formatOf(item))
		.sort((first, second) => second.modifiedAt.getTime() - first.modifiedAt.getTime());

	return { items };
}
