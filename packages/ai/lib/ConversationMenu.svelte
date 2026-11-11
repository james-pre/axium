<script lang="ts">
	import { text } from '@axium/client';
	import { Icon, Popover } from '@axium/client/components';
	import { deleteConversation } from './actions.js';

	const { id, onrename, showToggle = 'hover' }: { id: string; onrename(): void; showToggle?: 'hover' | 'always' } = $props();
</script>

<Popover {showToggle}>
	<button class="reset menu-item" onclick={onrename}>
		<Icon i="pen" />
		<span>{text('generic.rename')}</span>
	</button>
	<button class="reset menu-item" onclick={() => deleteConversation(id)}>
		<Icon i="trash" />
		<span>{text('generic.delete')}</span>
	</button>
</Popover>
