import { text } from '@axium/client';
import { fetchAPI } from '@axium/client/requests';
import { toast } from '@axium/client/toast';
import { redirect } from '@sveltejs/kit';

export async function load({ params }) {
	try {
		return { conversation: await fetchAPI('GET', 'ai/conversations/:id', {}, params.id!) };
	} catch (error) {
		if ((error as { status?: number }).status != 404) throw error;
		void toast('warning', text('ai.conversation_missing'));
		redirect(307, '/ai');
	}
}
