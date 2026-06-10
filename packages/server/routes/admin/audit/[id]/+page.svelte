<script lang="ts">
	import { text } from '@axium/client';
	import { Severity } from '@axium/core/audit';
	import '../styles.css';
	import UserCard from '@axium/client/components/UserCard';

	const { data } = $props();
	const { event } = data;
</script>

<svelte:head>
	<title>{text('page.admin.audit.event_title', { id: event.id })}</title>
</svelte:head>

<h2>{text('page.admin.audit.event_heading')}</h2>

<h4>{text('page.admin.audit.uuid')}</h4>
<p>{event.id}</p>

<h4>{text('page.admin.audit.severity')}</h4>
<p class="severity--{Severity[event.severity].toLowerCase()}">{Severity[event.severity]}</p>

<h4>{text('page.admin.audit.name')}</h4>
<p>{event.name}</p>

<h4>{text('page.admin.audit.timestamp')}</h4>
<p>{event.timestamp.toLocaleString()}</p>

<h4>{text('page.admin.audit.source')}</h4>
<p>{event.source}</p>

<h4>{text('page.admin.audit.tags')}</h4>
<p>{event.tags.join(', ')}</p>

<h4>{text('page.admin.audit.user')}</h4>
{#if event.user}
	<UserCard user={event.user} href="/admin/users/{event.user.id}" />
{:else}
	<i>{text('generic.unknown')}</i>
{/if}

<h4>{text('page.admin.audit.extra_data')}</h4>

{#if event.name == 'response_error'}
	<h5>{text('page.admin.audit.error_stack')}</h5>
	<pre>{event.extra.stack}</pre>
{:else}
	<pre>{JSON.stringify(event.extra, null, 4)}</pre>
{/if}
