import { goto, invalidate } from '$app/navigation';
import { page } from '$app/state';
import { fetchAPI, text } from '@axium/client';
import { toastStatus } from '@axium/client/toast';

export function renameConversation(id: string, title: string): Promise<unknown> {
	return toastStatus(
		fetchAPI('PATCH', 'ai/conversations/:id', { title }, id).then(() => invalidate('ai:conversations')),
		text('ai.toast_renamed')
	);
}

export function deleteConversation(id: string): Promise<unknown> {
	return toastStatus(
		fetchAPI('DELETE', 'ai/conversations/:id', {}, id).then(async () => {
			await invalidate('ai:conversations');
			if (page.params.id == id) await goto('/ai');
		}),
		text('ai.toast_deleted')
	);
}
