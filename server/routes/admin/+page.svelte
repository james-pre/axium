<script lang="ts">
	import { text } from '@axium/client';
	import { Version } from '@axium/client/components';
	import { Severity } from '@axium/core';
	import { getPackage } from '@axium/core/packages';
	import { _throw, capitalize } from 'utilium';

	const { data } = $props();
	const packages = ['server', 'core', 'client'] as const;
</script>

<svelte:head>
	<title>{text('page.admin.dashboard.title')}</title>
</svelte:head>

<h2>{text('page.admin.heading')}</h2>

{#each packages as name}
	<p>
		Axium {capitalize(name)}
		<Version v={data.versions[name]} latest={getPackage('@axium/' + name).then(pkg => pkg?._latest || _throw(null))} />
	</p>
{/each}

<h3><a href="/admin/users">{text('page.admin.dashboard.users_link')}</a></h3>

<p>{text('page.admin.dashboard.stats', { users: data.users, sessions: data.sessions, passkeys: data.passkeys })}</p>

<h3><a href="/admin/config">{text('page.admin.dashboard.config_link')}</a></h3>

<p>{text('page.admin.dashboard.config_files', { count: data.configFiles })}</p>

<h3><a href="/admin/plugins">{text('page.admin.dashboard.plugins_link')}</a></h3>

<p>{text('page.admin.dashboard.plugins_loaded', { count: data.plugins })}</p>

<h3><a href="/admin/audit">{text('page.admin.audit.heading')}</a></h3>

<p>
	{data.auditEvents
		.map((count, severity) => count && `${count} ${Severity[severity].toUpperCase()} events`)
		.filter(v => v)
		.join(', ')}.
</p>

<style>
	h3 {
		text-decoration: underline;
	}
</style>
