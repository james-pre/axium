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

<div id="event">
	<h4>UUID</h4>
	<span>{event.id}</span>
	<h4>Severity</h4>
	<span class="severity--{Severity[event.severity].toLowerCase()}">{Severity[event.severity]}</span>
	<h4>Name</h4>
	<span>{event.name}</span>
	<h4>Timestamp</h4>
	<span>{new Date(event.timestamp).toLocaleString()}</span>
	<h4>Source</h4>
	<span>{event.source}</span>
	<h4>Tags</h4>
	<span>{event.tags.join(', ')}</span>
	<h4>User</h4>
	{#if event.user}
		<UserCard user={event.user} href="/admin/users/{event.user.id}" />
	{:else}
		<i>Unknown</i>
	{/if}
</div>

<h4>Extra Data</h4>

<pre>{JSON.stringify(event.extra, null, 4)}</pre>

<style>
	pre {
		background-color: var(--bg-menu);
		padding: 1em;
		border-radius: 0.5em;
	}
</style>
