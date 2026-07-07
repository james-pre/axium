import { fetchAPI } from '@axium/client/requests';
import { emailFolders, type EmailFolder } from '@axium/email/common';
import { redirect } from '@sveltejs/kit';

export async function load({ parent, params }) {
	const { session } = await parent();

	if (!session) redirect(307, `/login?after=/email/${params.folder}`);

	const folder = params.folder as EmailFolder | 'starred';
	if (folder != 'starred' && !emailFolders.includes(folder)) redirect(307, '/email/inbox');

	const emails = await fetchAPI('GET', 'users/:id/email', folder == 'starred' ? { starred: true } : { folder }, session.userId);

	return { emails, folder, session };
}
