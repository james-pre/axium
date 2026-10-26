<script lang="ts">
	import { fetchAPI, text } from '@axium/client';
	import { Icon } from '@axium/client/components';
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

{#if publicKey}
	<h4>{text('page.account.device_preferences')}</h4>
	<div class="preference">
		<label for="notifications:checkbox">{text('page.account.notifications.label')}</label>
		<input
			id="notifications:checkbox"
			type="checkbox"
			checked={subscribed}
			disabled={Notification.permission == 'denied'}
			onchange={toggle}
		/>
		<label for="notifications:checkbox" class="checkbox">
			{#if subscribed}<Icon i="check" --size="1.3em" />{/if}
		</label>
	</div>
	{#if Notification.permission == 'denied'}
		<p class="subtle">{text('page.account.notifications.blocked')}</p>
	{/if}
{/if}

<style>
	.preference {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1em;
	}
</style>
