<script lang="ts">
	import { formatBytes } from '@axium/core/format';
	import { NumberBar } from '@axium/client/components';
	import { getUserStorageInfo } from '@axium/storage/client';
	import type { UserStorageInfo } from '@axium/storage/common';

	const { userId, info }: { userId: string; info?: UserStorageInfo } = $props();
</script>

{#await info || getUserStorageInfo(userId) then info}
	<p>
		<a href="/files/usage">
			<NumberBar
				max={info.limits.user_size * 1_000_000}
				value={info.usage.bytes}
				text="Using {formatBytes(info.usage.bytes)} of {formatBytes(info.limits.user_size * 1_000_000)}"
				--fill="#345"
			/>
		</a>
	</p>
{:catch error}
	<p>Couldn't load your uploads.</p>
	<p>{error.message}</p>
{/await}
