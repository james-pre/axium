<script lang="ts">
	import { Severity } from '@axium/core/audit';
	import '../styles.css';
	import UserCard from '@axium/client/components/UserCard';

	const { data } = $props();
	const { event } = data;
</script>

<svelte:head>
	<title>Admin — Audit Log Event #{event.id}</title>
</svelte:head>

<h2>Audit Event</h2>

<h4>UUID</h4>
<p>{event.id}</p>

<h4>Severity</h4>
<p class="severity--{Severity[event.severity].toLowerCase()}">{Severity[event.severity]}</p>

<h4>Name</h4>
<p>{event.name}</p>

<h4>Timestamp</h4>
<p>{event.timestamp.toLocaleString()}</p>

<h4>Source</h4>
<p>{event.source}</p>

<h4>Tags</h4>
<p>{event.tags.join(', ')}</p>

<h4>User</h4>
{#if event.user}
	<UserCard user={event.user} href="/admin/users/{event.user.id}" />
{:else}
	<i>Unknown</i>
{/if}

<h4>Extra Data</h4>

{#if event.name == 'response_error'}
	<h5>Error Stack</h5>
	<pre>{event.extra.stack}</pre>
{:else}
	<pre>{JSON.stringify(event.extra, null, 4)}</pre>
{/if}
