<script lang="ts">
	import ClipboardCopy from './ClipboardCopy.svelte';

	const { url }: { url: string } = $props();

	const href = $derived(new URL(url, location.origin).href);
</script>

<pre class="URLText"><span>{href}</span><ClipboardCopy value={href} --size="16px" /></pre>

<style>
	.URLText {
		display: flex;
		align-items: center;
		justify-content: space-between;

		span {
			overflow-x: scroll;
		}
	}
</style>
