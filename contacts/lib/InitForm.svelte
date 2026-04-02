<script lang="ts">
	import { text } from '@axium/client';
	import { dynamicRows } from '@axium/client/attachments';
	import { Icon, LocationSelect, ZodInput, Discovery, discovery } from '@axium/client/components';
	import { ContactURL, Custom, Email, Init, Phone, Relationship, SigDate, type Contact } from '@axium/contacts';
	import ContactPicture from './ContactPicture.svelte';
	import DateSelect from './DateSelect.svelte';
	import { contactDiscovery } from './discovery.svelte';
	import { name as formatName } from '@axium/contacts/client/format';

	let showDetailed = $state(false);

	let {
		init = $bindable<Init & Partial<Contact>>(),
		save,
		back = '/contacts',
	}: { init: Init & Partial<Contact>; save(init: Init): unknown; back?: string } = $props();

	let more = $state({
		names: false,
		job: false,
	});

	type ArrayField = 'emails' | 'phones' | 'addresses' | 'relationships' | 'urls' | 'dates' | 'custom';

	function updateValue() {}
</script>

{#snippet zod(name: keyof Init, showMore?: boolean, detailed?: boolean)}
	{#if !detailed || showMore || init[name]}
		<ZodInput bind:rootValue={init} path={name} schema={Init.shape[name]} {updateValue} noLabel="placeholder" />
	{/if}
{/snippet}

{#snippet moreToggle(key: keyof typeof more)}
	<button class="reset icon-text toggle" onclick={() => (more[key] = !more[key])}>
		<Icon i="chevron-{more[key] ? 'up' : 'down'}" />
	</button>
{/snippet}

{#snippet add(field: ArrayField)}
	{#if init[field].length}<span />{/if}
	<button class="icon-text" onclick={() => init[field].push({} as any)}>
		<Icon i="plus" />
		<span>{text('contacts.init.add.' + field)}</span>
	</button>
	<span />
{/snippet}

<div class="contact-init-actions">
	<a href={back}>
		<button class="icon-text">
			<Icon i="arrow-left" />
			<span>{text('contacts.back')}</span>
		</button>
	</a>

	<span></span>

	<button class="icon-text save" onclick={() => save(init)}>
		<span>{text('contacts.init.save')}</span>
	</button>
</div>

{#if init.id}
	<div class="contact-init-header">
		<ContactPicture contact={init as typeof init & { id: string }} --size="150px" />
		<span class="contact-name-title">{formatName(init)}</span>
	</div>
{/if}

<div class="contact-init">
	<Icon i="user" />
	<div class="section">
		{@render zod('display', more.names, true)}
		{@render zod('prefix', more.names, true)}
		{@render zod('givenName', more.names)}
		{@render zod('givenName2', more.names, true)}
		{@render zod('surname', more.names)}
		{@render zod('suffix', more.names, true)}
		{@render zod('nickname', more.names, true)}
	</div>
	{@render moreToggle('names')}

	<Icon i="regular/buildings" />
	<div class="section">
		{@render zod('company', more.job)}
		{@render zod('jobTitle', more.job)}
		{@render zod('department', more.job, true)}
	</div>
	{@render moreToggle('job')}

	<Icon i="regular/envelope" />
	{#each init.emails, i}
		{#if i}<span />{/if}
		<div class={['email', init.emails.length > 1 && 'with-label']}>
			<ZodInput bind:rootValue={init} path="emails.{i}.email" schema={Email.shape.email} {updateValue} noLabel="placeholder" />
			{#if init.emails.length > 1}
				<ZodInput bind:rootValue={init} path="emails.{i}.label" schema={Email.shape.label} {updateValue} noLabel="placeholder" />
			{/if}
		</div>
		<Icon i="xmark" onclick={() => init.emails.splice(i, 1)} />
	{/each}
	{@render add('emails')}

	<Icon i="phone" />
	{#each init.phones, i}
		{#if i}<span />{/if}
		<div class={['phone', init.phones.length > 1 && 'with-label']}>
			<ZodInput bind:rootValue={init} path="phones.{i}.country" schema={Phone.shape.country} {updateValue} noLabel="placeholder" />
			<ZodInput bind:rootValue={init} path="phones.{i}.number" schema={Phone.shape.number} {updateValue} noLabel="placeholder" />
			{#if init.phones.length > 1}
				<ZodInput bind:rootValue={init} path="phones.{i}.label" schema={Phone.shape.label} {updateValue} noLabel="placeholder" />
			{/if}
		</div>
		<Icon i="xmark" onclick={() => init.phones.splice(i, 1)} />
	{/each}
	{@render add('phones')}

	<Icon i="regular/location-dot" />
	{#each init.addresses, i}
		{#if i}<span />{/if}
		<div class="section">
			<LocationSelect bind:value={init.addresses[i]} />
		</div>
		<Icon i="xmark" onclick={() => init.addresses.splice(i, 1)} />
	{/each}

	{@render add('addresses')}

	<Icon i="cake-candles" />
	<div class="section">
		<DateSelect bind:day={init.birthDay} bind:month={init.birthMonth} bind:year={init.birthYear} />
	</div>
	<span />

	{#if showDetailed}
		<Icon i="regular/circle-nodes" />
		{#each init.relationships as rel, i}
			{#if i}<span />{/if}
			<div class="section">
				<Discovery
					onSelect={result => (rel.to = result.contact.id)}
					sources={[contactDiscovery]}
					exclude={target =>
						[init.id, ...init.relationships.map(r => r.to)].filter((v): v is string => !!v).includes(target.contact.id)}
				/>
				<ZodInput
					bind:rootValue={init}
					path="relationships.{i}.label"
					schema={Relationship.shape.label}
					{updateValue}
					noLabel="placeholder"
				/>
			</div>
			<Icon i="xmark" onclick={() => init.relationships.splice(i, 1)} />
		{/each}
		{@render add('relationships')}

		<Icon i="regular/calendar-day" />
		{#each init.dates, i}
			{#if i}<span />{/if}
			<div class="section">
				<ZodInput bind:rootValue={init} path="dates.{i}" schema={SigDate} {updateValue} noLabel="placeholder" />
			</div>
			<Icon i="xmark" onclick={() => init.dates.splice(i, 1)} />
		{/each}
		{@render add('dates')}

		<Icon i="link-simple" />
		{#each init.urls, i}
			{#if i}<span />{/if}
			<div class="section">
				<ZodInput bind:rootValue={init} path="urls.{i}" schema={ContactURL} {updateValue} noLabel="placeholder" />
			</div>
			<Icon i="xmark" onclick={() => init.urls.splice(i, 1)} />
		{/each}
		{@render add('urls')}

		<Icon i="regular/input-text" />
		{#each init.custom, i}
			{#if i}<span />{/if}
			<div class="section">
				<ZodInput bind:rootValue={init} path="custom.{i}" schema={Custom} {updateValue} noLabel="placeholder" />
			</div>
			<Icon i="xmark" onclick={() => init.custom.splice(i, 1)} />
		{/each}
		{@render add('custom')}
	{/if}

	<Icon i="regular/note" />
	<textarea bind:value={init.notes} {@attach dynamicRows(50, 3)}></textarea>
	<span />

	<span />
	<div>
		<button onclick={() => (showDetailed = !showDetailed)}>
			<span>{text('contacts.init.show_' + (showDetailed ? 'less' : 'more'))}</span>
		</button>
	</div>
	<span />
</div>

<style>
	.contact-name-title {
		margin-left: 2em;
		font-size: 2em;
	}

	.contact-init-header,
	.contact-init,
	.contact-init-actions {
		padding: 2em;
		margin: 1em;
		width: calc(700px - 2em);

		@media (width < 700px) {
			width: calc(100% - 2em);
		}
	}

	.contact-init-header,
	.contact-init-actions {
		display: flex;
		gap: 1em;
		align-items: center;
	}

	.contact-init-actions > :not(span) {
		flex: 0 0 auto;
	}

	.contact-init-actions > span {
		flex: 1 1 auto;
	}

	.contact-init {
		display: grid;
		grid-template-columns: 1em 1fr 1em;
		gap: 1em;
		border-radius: 1em;
		background-color: var(--bg-menu);

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

	.email {
		display: grid;
		gap: 0.5em;
		grid-template-columns: 1fr;

		&.with-label {
			grid-template-columns: 1fr 1fr;
		}
	}

	.phone {
		display: grid;
		gap: 0.5em;
		grid-template-columns: 4em 1fr;

		&.with-label {
			grid-template-columns: 4em 1fr 1fr;
		}
	}
</style>
