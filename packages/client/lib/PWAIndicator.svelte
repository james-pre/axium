<script lang="ts">
	import { pwa } from '@axium/client/web';
	import feature from '@axium/core/features';
	import Icon from './Icon.svelte';

	const iconMap = {
		installing: 'regular/cloud-arrow-down',
		pending: 'circle-arrow-up',
		active: 'regular/cloud-check',
		failed: 'cloud-xmark',
		none: 'regular/cloud-slash',
	} satisfies Record<pwa.InstallPhase, string>;

	function onclick() {
		if ($pwa.updateReady) pwa.activate();
		else pwa.update();
	}
</script>

{#if pwa.supported && feature('pwa')}
	<Icon class="PWAIndicator" i={iconMap[$pwa.installPhase]} {onclick} />
{/if}
