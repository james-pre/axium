<script lang="ts">
	import { text } from '@axium/client';
	import { Icon } from '@axium/client/components';
</script>

<a href="/ai" class="back" title={text('ai.back')} aria-label={text('ai.back')}>
	<Icon i="chevron-left" />
</a>

<style>
	.back {
		display: none;
	}

	@media (width < 700px) {
		.back {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			padding: 0.5em;
			margin: -0.5em 0 -0.5em -0.5em;
		}
	}
</style>
