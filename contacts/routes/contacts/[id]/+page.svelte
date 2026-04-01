<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import * as format from '@axium/contacts/format';

	const { data } = $props();
	const { contact } = data;
</script>

<div class="contact-actions">
	<a href="/contacts">
		<button class="icon-text">
			<Icon i="arrow-left" />
			<span>{text('contacts.back')}</span>
		</button>
	</a>

	<a href="/contacts/{contact.id}/edit">
		<button class="icon-text">
			<Icon i="pencil" />
			<span>{text('contacts.edit')}</span>
		</button>
	</a>
</div>

{#snippet part(i: string, value: string | false | 0 | null | undefined)}
	{#if value}
		<Icon {i} />
		<span>{value}</span>
	{/if}
{/snippet}

{#snippet arrayField<V>(i: string, values: V[], render: (value: V) => string | Promise<string>)}
	{#if values.length}
		<Icon {i} />
		<div class="section">
			{#each values as value}
				{#await render(value)}
					<i>{text('contacts.field_loading')}</i>
				{:then str}
					<span>{str}</span>
				{/await}
			{/each}
		</div>
	{/if}
{/snippet}

<div class="contact">
	{@render part('user', format.name(contact))}
	{@render part('regular/buildings', format.job(contact))}
	{@render arrayField('regular/envelope', contact.emails, email => email.email)}

	{@render arrayField('phone', contact.phones, format.phone)}

	{@render arrayField('regular/location-dot', contact.addresses, format.address)}

	{@render part('cake-candles', format.birthDate(contact))}

	{@render arrayField('regular/circle-nodes', contact.relationships, format.relationship)}

	{@render arrayField('regular/calendar-day', contact.dates, format.date)}

	{@render arrayField('link-simple', contact.urls, url => url)}

	{@render arrayField('regular/input-text', contact.custom, custom => custom.value)}

	{@render part('regular/note', contact.notes)}
</div>

<style>
	.contact,
	.contact-actions {
		padding: 2em;
		width: 700px;

		@media (width < 700px) {
			width: 100%;
		}
	}

	.contact-actions {
		display: flex;
		gap: 1em;
		align-items: center;
		justify-content: space-between;
	}

	.contact {
		display: grid;
		grid-template-columns: 1em 1fr;
		gap: 1em;

		button.toggle {
			height: 1em;
		}

		:global(.ZodInput) {
			display: flex;
			flex-direction: column;
			gap: 1em;
		}
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
	}
</style>
