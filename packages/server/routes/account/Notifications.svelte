<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { toast } from '@axium/client/toast';
	import { push } from '@axium/client/web';

	const { publicKey } = await fetchAPI('GET', 'push');

	let subscribed = $state(Notification.permission == 'granted' && !!(await push.getSubscription()));

	async function toggle(event: Event & { currentTarget: HTMLInputElement }) {
		const input = event.currentTarget;
		try {
			if (input.checked) await push.subscribe();
			else await push.unsubscribe();
			subscribed = input.checked;
		} catch (e) {
			input.checked = subscribed;
			await toast('error', e);
		}
	}
</script>

{#if !publicKey}
	<p class="subtle">{text('page.account.notifications.not_configured')}</p>
{:else}
	<div class="item info">
		<p class="subtle">{text('page.account.notifications.this_device')}</p>
		<p>{subscribed ? text('page.account.notifications.enabled') : text('page.account.notifications.disabled')}</p>
		<input type="checkbox" checked={subscribed} disabled={Notification.permission == 'denied'} onchange={toggle} />
	</div>
	{#if Notification.permission == 'denied'}
		<p class="subtle">{text('page.account.notifications.blocked')}</p>
	{/if}
{/if}
