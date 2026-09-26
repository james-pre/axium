<script lang="ts">
	import { text } from '@axium/client';
	import { bytes as formatBytes } from 'utilium/format';
	import { Boundary, NumberBar } from '@axium/client/components';
	import { getUserStats } from '@axium/storage/client';
	import type { UserStorageInfo } from '@axium/storage/common';

	const { userId, info }: { userId?: string; info?: UserStorageInfo } = $props();
</script>

{#if !info && !userId}
	<p>{text('storage.Usage.login_prompt')}</p>
{:else}
	<Boundary error="storage.Usage.error" inline>
		{const usage = info || (await getUserStats(userId!))}
		<p>
			<a href="/files/usage">
				<NumberBar
					max={!!usage.limits.user_size && Number(usage.limits.user_size * 1_000_000n)}
					value={Number(usage.usedBytes)}
					text="{formatBytes(usage.usedBytes)} {!usage.limits.user_size
						? ''
						: '/ ' + formatBytes(usage.limits.user_size * 1_000_000n)}"
				/>
			</a>
		</p>
	</Boundary>
{/if}
