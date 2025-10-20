<script>
	import { Severity } from '@axium/core';

	const { data } = $props();
</script>

<svelte:head>
	<title>Admin — Dashboard</title>
</svelte:head>

<h2>Administration</h2>

<p>Axium Server version {data.version}</p>

<h3><a href="/admin/users">Users</a></h3>

<p>{data.users} users, {data.sessions} sessions, {data.passkeys} passkeys.</p>

<h3><a href="/admin/config">Configuration</a></h3>

<p>{data.configFiles} files loaded.</p>

<h3><a href="/admin/plugins">Plugins</a></h3>

<p>{data.plugins} plugins loaded.</p>

<h3><a href="/admin/audit">Audit Log</a></h3>

<p>
	{Object.entries(data.auditEvents)
		.map(([severity, count]) => `${count} ${Severity[severity].toUpperCase()} events`)
		.join(', ')}.
</p>

<style>
	h3 {
		text-decoration: underline;
	}
</style>
