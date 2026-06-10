<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
	import '@axium/client/styles/list';
	import './styles.css';
	import { Severity, severityNames } from '@axium/core';
	import { capitalize } from 'utilium';

	const { data } = $props();
</script>

<svelte:head>
	<title>{text('page.admin.audit.title')}</title>
</svelte:head>

<h2>{text('page.admin.audit.heading')}</h2>

{#if data.filterError}
	<div class="error">
		<strong>{text('page.admin.audit.invalid_filter')}</strong>
		{#each data.filterError.split('\n') as line}
			<p>{line}</p>
		{/each}
	</div>
{/if}

<form id="filter" method="dialog">
	<h4>{text('page.admin.audit.filters')}</h4>

	<div class="filter-field">
		<span>{text('page.admin.audit.filter.severity')}</span>
		<select name="severity" value={data.filter.severity}>
			{#each severityNames as value}
				<option {value} selected={value == 'info'}>{capitalize(value)}</option>
			{/each}
		</select>
	</div>

	<div class="filter-field">
		<span>{text('page.admin.audit.filter.since')}</span>
		<input type="date" name="since" value={data.filter.since} />
	</div>

	<div class="filter-field">
		<span>{text('page.admin.audit.filter.until')}</span>
		<input type="date" name="until" value={data.filter.until} />
	</div>

	<div class="filter-field">
		<span>{text('page.admin.audit.filter.tags')}</span>
		<input type="text" name="tags" value={data.filter.tags} />
	</div>

	<div class="filter-field">
		<span>{text('page.admin.audit.filter.event')}</span>
		{#if data.configured}
			<select name="event">
				<option value="">{text('page.admin.audit.any')}</option>
				{#each data.configured.name as name}
					<option value={name} selected={data.filter.event == name}>{name}</option>
				{/each}
			</select>
		{:else}
			<input type="text" name="event" value={data.filter.event} />
		{/if}
	</div>

	<div class="filter-field">
		<span>{text('page.admin.audit.filter.source')}</span>
		{#if data.configured}
			<select name="source">
				<option value="">{text('page.admin.audit.any')}</option>
				{#each data.configured.source as source}
					<option value={source} selected={data.filter.source == source}>{source}</option>
				{/each}
			</select>
		{:else}
			<input type="text" name="source" value={data.filter.source} />
		{/if}
	</div>

	<div class="filter-field">
		<span>{text('page.admin.audit.filter.user')}</span>
		<input type="text" name="user" size="36" value={data.filter.user} />
	</div>

	<div class="inline-button-container">
		<button
			class="inline-button"
			onclick={e => {
				e.preventDefault();
				const fd = new FormData(e.currentTarget.form!);
				const params = new URLSearchParams();
				for (let [key, value] of fd.entries()) {
					if (!value) continue;
					switch (key) {
						case 'severity':
							if (value != 'info') params.set(key, value as string);
							break;
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
			}}>{text('page.admin.audit.apply')}</button
		>
		<button
			class="inline-button"
			onclick={e => {
				e.preventDefault();
				location.search = '';
			}}>{text('page.admin.audit.reset')}</button
		>
	</div>
</form>

<div class="list-container">
	<div class="list">
		<div class="list-item list-header">
			<span>{text('page.admin.audit.timestamp')}</span>
			<span>{text('page.admin.audit.severity')}</span>
			<span>{text('page.admin.audit.source')}</span>
			<span>{text('page.admin.audit.name')}</span>
			<span>{text('page.admin.audit.tags')}</span>
			<span>{text('page.admin.audit.user')}</span>
		</div>

		{#each data.events as event}
			<div class="list-item" onclick={e => e.currentTarget === e.target && (location.href = '/admin/audit/' + event.id)}>
				<span>{event.timestamp.toLocaleString()}</span>
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
					<i>{text('generic.unknown')}</i>
				{/if}
				<a href="/admin/audit/{event.id}"><Icon i="chevron-right" /></a>
			</div>
		{:else}
			<p class="list-empty">{text('page.admin.audit.no_events')}</p>
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
		display: flex;
		flex-wrap: wrap;
		flex-direction: column;
		gap: 0.25em;
		width: fit-content;
	}

	.filter-field {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.25em;
	}

	@media (width < 700px) {
		#filter {
			width: calc(100%);
		}
	}
</style>
