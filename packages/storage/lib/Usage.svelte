<script lang="ts">
	import { text } from '@axium/client';
	import { bytes as formatBytes } from 'utilium/format';
	import { NumberBar } from '@axium/client/components';
	import { getUserStats } from '@axium/storage/client';
	import type { UserStorageInfo } from '@axium/storage/common';

	const { userId, info }: { userId?: string; info?: UserStorageInfo } = $props();
</script>

{#if !info && !userId}
	<p>{text('storage.Usage.login_prompt')}</p>
{:else}
	{#await info || getUserStats(userId!) then info}
		<p>
			<a href="/files/usage">
				<NumberBar
					max={!!info.limits.user_size && Number(info.limits.user_size * 1_000_000n)}
					value={Number(info.usedBytes)}
					text="{formatBytes(info.usedBytes)} {!info.limits.user_size
						? ''
						: '/ ' + formatBytes(info.limits.user_size * 1_000_000n)}"
				/>
			</a>
		</p>
	{:catch error}
		{console.log(text('storage.Usage.error'), error)}
		<p>{text('storage.Usage.error')}</p>
	{/await}
{/if}
