<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { NumberBar } from '@axium/client/components';
	import { getUserStats } from '@axium/storage/client';
	import type { UserStorageInfo } from '@axium/storage/common';

	const { userId, info }: { userId?: string; info?: UserStorageInfo } = $props();
</script>

{#if !info && !userId}
	<p>Log in to see storage usage.</p>
{:else}
	{#await info || getUserStats(userId!) then info}
		<p>
			<a href="/files/usage">
				<NumberBar
					max={info.limits.user_size && info.limits.user_size * 1_000_000}
					value={info.usedBytes}
					text="Using {formatBytes(info.usedBytes)} {!info.limits.user_size
						? ''
						: 'of ' + formatBytes(info.limits.user_size * 1_000_000)}"
				/>
			</a>
		</p>
	{:catch error}
		<p>Couldn't load your uploads.</p>
		<p>{error.message}</p>
	{/await}
{/if}
