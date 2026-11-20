<script lang="ts">
	import { text } from '@axium/client';
	import type { SecretInfo } from '@axium/core';
	import ClipboardCopy from './ClipboardCopy.svelte';
	import Icon from './Icon.svelte';

	const { info }: { info: SecretInfo } = $props();

	const credential = $derived('axium.' + info.id);
</script>

<span class="SecretStatus">
	<Icon i={info.source ? 'lock-keyhole' : 'lock-keyhole-open'} title={text(`SecretStatus.${info.source ?? 'unset'}`, { id: info.id })} />
	<code>{credential}</code>
	<ClipboardCopy value={credential} />
</span>

<style>
	.SecretStatus {
		display: inline-flex;
		align-items: center;
		gap: 0.5em;
		min-width: 0;
	}

	code {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
