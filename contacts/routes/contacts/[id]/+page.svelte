<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import { getContact } from '@axium/contacts/client';
	import { ContactPFP, Field } from '@axium/contacts/components';
	import * as format from '@axium/contacts/format';

	const { data } = $props();
	const { contact } = data;
</script>

<svelte:head>
	<title>{text('contacts.named_title', { name: format.name(contact) })}</title>
</svelte:head>

<div class="contact-actions">
	<a href="/contacts">
		<button class="icon-text">
			<Icon i="arrow-left" />
			<span>{text('contacts.back')}</span>
		</button>
	</a>

	<span></span>

	<a href="/contacts/{contact.id}/edit">
		<button class="icon-text">
			<Icon i="pencil" />
			<span>{text('contacts.edit')}</span>
		</button>
	</a>

	<button class="icon-text">
		<Icon i="trash" />
		<span>{text('contacts.delete')}</span>
	</button>

	<button class="icon-text">
		<Icon i="export" />
		<span>{text('contacts.export')}</span>
	</button>
</div>

{#snippet part(i: string, value: string | false | 0 | null | undefined)}
	{#if value}
		<Icon {i} />
		<span>{value}</span>
	{/if}
{/snippet}

<div class="contact-header">
	<ContactPFP {contact} --size="100px" />
	<span>{format.name(contact)}</span>
</div>

<div class="contact">
	{@render part('regular/buildings', format.job(contact))}

	{#if contact.emails.length}
		<Icon i="regular/envelope" />
		<div class="section">
			{#each contact.emails as { email, label, isDefault }}
				<Field text={email} link="mailto:{email}" {label} {isDefault} />
			{/each}
		</div>
	{/if}

	{#if contact.phones.length}
		<Icon i="phone" />
		<div class="section">
			{#each contact.phones as phone}
				<Field text={format.phone(phone)} link={format.phoneLink(phone)} label={phone.label} isDefault={phone.isDefault} />
			{/each}
		</div>
	{/if}

	{#if contact.addresses.length}
		<Icon i="regular/location-dot" />
		<div class="section">
			{#each contact.addresses as addr}
				<Field text={format.address(addr)} label={addr.label} isDefault={addr.isDefault} />
			{/each}
		</div>
	{/if}

	{@render part('cake-candles', format.birthDate(contact))}

	{#if contact.relationships.length}
		<Icon i="regular/circle-nodes" />
		<div class="section">
			{#each contact.relationships as { to, label }}
				{#await getContact(to) then other}
					<Field text={format.name(other)} {label} link="/contacts/{other.id}" />
				{/await}
			{/each}
		</div>
	{/if}

	{#if contact.dates.length}
		<Icon i="regular/calendar-day" />
		<div class="section">
			{#each contact.dates as date}
				<Field text={format.date(date)} label={date.label} />
			{/each}
		</div>
	{/if}

	{#if contact.urls.length}
		<Icon i="link-simple" />
		<div class="section">
			{#each contact.urls as url}
				<Field text={url} link={url} />
			{/each}
		</div>
	{/if}

	{#if contact.custom.length}
		<Icon i="regular/input-text" />
		<div class="section">
			{#each contact.custom as custom}
				<Field text={custom.value} label={custom.label} />
			{/each}
		</div>
	{/if}

	{@render part('regular/note', contact.notes)}
</div>

<style>
	.contact-header,
	.contact,
	.contact-actions {
		padding: 2em;
		width: 700px;

		@media (width < 700px) {
			width: 100%;
		}
	}

	.contact-header,
	.contact-actions {
		display: flex;
		gap: 1em;
		align-items: center;
	}

	.contact-actions a {
		flex: 0 0 auto;
	}

	.contact-actions > span {
		flex: 1 1 auto;
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
