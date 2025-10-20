<script lang="ts">
	import { Icon } from '@axium/client/components';
	import '@axium/client/styles/list';
	import './styles.css';
	import { Severity, severityNames } from '@axium/core';
	import { capitalize } from 'utilium';

	const { data } = $props();
</script>

<svelte:head>
	<title>Admin — Audit Log</title>
</svelte:head>

<h2>Audit Log</h2>

{#if data.filterError}
	<div class="error">
		<strong>Invalid Filter:</strong>
		{#each data.filterError.split('\n') as line}
			<p>{line}</p>
		{/each}
	</div>
{/if}

<form id="filter" method="dialog">
	<h4>Filters</h4>
	<span>Minimum Severity:</span>
	<select name="severity" value={data.filter.severity}>
		{#each severityNames as value}
			<option {value} selected={value == 'info'}>{capitalize(value)}</option>
		{/each}
	</select>
	<span>Since:</span>
	<input type="date" name="since" value={data.filter.since} />

	<span>Until:</span>
	<input type="date" name="until" value={data.filter.until} />

	<span>Tags:</span>
	<input type="text" name="tags" value={data.filter.tags} />

	<span>Event Name:</span>
	<input type="text" name="event" value={data.filter.event} />

	<span>Source:</span>
	<input type="text" name="source" value={data.filter.source} />

	<span>User UUID:</span>
	<input type="text" name="user" size="36" value={data.filter.user} />
	<button
		onclick={e => {
			e.preventDefault();
			const fd = new FormData(e.currentTarget.form!);
			const params = new URLSearchParams();
			for (let [key, value] of fd.entries()) {
				if (!value) continue;
				switch (key) {
					case 'since':
					case 'until':
						params.set(key, new Date(value as string).toISOString());
						break;
					case 'tags':
						for (const tag of value
							.toString()
							.split(',')
							.map(t => t.trim()))
							params.append(key, tag);
						break;
					default:
						params.set(key, value as string);
				}
			}
			location.search = params ? '?' + params.toString() : '';
		}}>Apply</button
	>
	<button
		onclick={e => {
			e.preventDefault();
			location.search = '';
		}}>Reset</button
	>
</form>

<div class="list-container">
	<div class="list">
		<div class="list-item list-header">
			<span>Timestamp</span>
			<span>Severity</span>
			<span>Source</span>
			<span>Name</span>
			<span>Tags</span>
			<span>User</span>
		</div>

		{#each data.events as event}
			<div class="list-item">
				<span>{new Date(event.timestamp).toLocaleString()}</span>
				<span class="severity--{Severity[event.severity].toLowerCase()}">{Severity[event.severity]}</span>
				<span>{event.source}</span>
				<span>{event.name}</span>
				<span>{event.tags.join(', ')}</span>
				{#if event.user}
					<a href="/admin/users/{event.userId}">
						{event.user.name}
						{#if event.userId === data.session?.userId}<span class="subtle">(You)</span>{/if}
					</a>
				{:else}
					<i>Unknown</i>
				{/if}
				<a href="/admin/audit/{event.id}"><Icon i="chevron-right" /></a>
			</div>
		{:else}
			<p class="list-empty">No audit log events found</p>
		{/each}
	</div>
</div>

<style>
	.list-item {
		grid-template-columns: 15em 10em 10em 1fr 1fr 10em repeat(1, 2em);
	}

	#filter {
		background-color: var(--bg-menu);
		padding: 1em;
		border-radius: 0.5em;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.25em;
		width: fit-content;

		h4 {
			grid-column: 1 / span 2;
		}
	}
</style>
