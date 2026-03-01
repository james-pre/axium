<script lang="ts">
	import { Version } from '@axium/client/components';
	import { Severity } from '@axium/core';
	import { getPackage } from '@axium/core/packages';
	import { _throw, capitalize } from 'utilium';

	const { data } = $props();
	const packages = ['server', 'core', 'client'] as const;
</script>

<svelte:head>
	<title>Admin — Dashboard</title>
</svelte:head>

<h2>Administration</h2>

{#each packages as name}
	<p>
		Axium {capitalize(name)}
		<Version v={data.versions[name]} latest={getPackage('@axium/' + name).then(pkg => pkg?._latest || _throw(null))} />
	</p>
{/each}

<h3><a href="/admin/users">Users</a></h3>

<p>{data.users} users, {data.sessions} sessions, {data.passkeys} passkeys.</p>

<h3><a href="/admin/config">Configuration</a></h3>

<p>{data.configFiles} files loaded.</p>

<h3><a href="/admin/plugins">Plugins</a></h3>

<p>{data.plugins} plugins loaded.</p>

<h3><a href="/admin/audit">Audit Log</a></h3>

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
