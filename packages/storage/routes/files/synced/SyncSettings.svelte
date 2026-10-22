<script lang="ts">
	import { text } from '@axium/client';
	import { FormDialog, Icon, ZodInput } from '@axium/client/components';
	import { confirm } from '@axium/client/dialogs';
	import { toast } from '@axium/client/toast';
	import { getRecursiveMetadata, updateItemMetadata, updateSync } from '@axium/storage/client';
	import { StorageSyncSettings, type StorageSyncInfo } from '@axium/storage/common';
	import { newlyExcluded, SyncRules } from '@axium/storage/rules';
	import { bytes as formatBytes, dateRange } from 'utilium/format';
	import { prettifyError } from 'zod';

	let { sync = $bindable(), dialog = $bindable() }: { sync: StorageSyncInfo; dialog?: HTMLDialogElement } = $props();

	/** Keys of help items, with the syntax they describe and an example pattern */
	const syntaxHelp = [
		['order'],
		['contents'],
		['name', '', 'node_modules'],
		['path', '', '/projects/notes.md'],
		['folder', '', 'build/'],
		['wildcard', '*', '*.log'],
		['folders', '**', '/projects/**/tmp'],
		['character', '?', 'draft?.txt'],
		['set', '[abc]', 'report-[0-9].pdf'],
	] as const;

	const savedSettings = () => ({ rules: sync.rules.slice(), hidden: sync.hidden });

	let settings = $state(savedSettings());

	/** Asks whether to trash items on the server that the new rules exclude. */
	async function offerTrash(excluded: [string, { id: string }][]): Promise<void> {
		if (!excluded.length) return;

		const paths = excluded.slice(0, 5).map(([path]) => path);
		if (excluded.length > 5) paths.push('…');

		const message = text('page.files.synced.excluded_confirm', { count: excluded.length, paths: paths.join(', ') });
		if (!(await confirm(message, { confirmText: text('page.files.synced.excluded_trash'), danger: true }))) return;

		await Promise.all(excluded.map(([, item]) => updateItemMetadata(item.id, { trash: true })));
	}

	async function submit() {
		const parsed = StorageSyncSettings.safeParse(settings);
		if (!parsed.success) throw prettifyError(parsed.error);

		const items = await getRecursiveMetadata(sync.itemId);
		const remote = new Map(items.map(item => [item.path, { id: item.id, directory: item.type == 'inode/directory' }]));
		const excluded = newlyExcluded(remote, new SyncRules(sync.rules), new SyncRules(parsed.data.rules));

		sync = { ...sync, ...(await updateSync(sync.itemId, parsed.data)) };
		settings = savedSettings();
		toast('success', text('page.files.synced.saved'));

		await offerTrash(excluded);
	}
</script>

<FormDialog bind:dialog submitText={text('page.files.synced.save')} {submit} cancel={() => (settings = savedSettings())}>
	<div class="sync-settings">
		<header>
			<h2>{sync.item.name}</h2>
			<p class="subtle">{text('page.files.synced.usage', { size: formatBytes(sync.usage.size), count: sync.usage.items })}</p>
		</header>

		<section>
			<h3>{text('page.files.synced.devices')}</h3>
			<p class="subtle">{text('page.files.synced.devices_description')}</p>
			{#each sync.devices as device}
				<div class="device">
					<Icon i="computer" />
					<strong>{device.host}</strong>
					<span class="subtle last-synced">
						{device.lastSynced
							? text('page.files.synced.last_synced_at', { time: dateRange(device.lastSynced) })
							: text('page.files.synced.never')}
					</span>
					<code class="path" title={device.localPath}>{device.localPath}</code>
				</div>
			{:else}
				<p class="subtle">{text('page.files.synced.no_devices')}</p>
			{/each}
		</section>

		<section>
			<h3>{text('page.files.synced.rules')}</h3>
			<p class="subtle">{text('page.files.synced.rules_description')}</p>
			<ZodInput
				schema={StorageSyncSettings.shape.rules}
				bind:rootValue={settings}
				path="rules"
				label={text('page.files.synced.add_rule')}
				noLabel="placeholder"
				updateValue={() => {}}
			/>
			<details class="subtle">
				<summary>{text('page.files.synced.rules_help')}</summary>
				<ul class="syntax">
					{#each syntaxHelp as [key, syntax, example]}
						<li>
							{#if syntax}<code>{syntax}</code>{/if}
							{text(`page.files.synced.rules_syntax.${key}`)}
							{#if example}<code>{example}</code>{/if}
						</li>
					{/each}
				</ul>
			</details>
		</section>

		<section>
			<h3>{text('page.files.synced.visibility')}</h3>
			<ZodInput
				schema={StorageSyncSettings.shape.hidden}
				bind:rootValue={settings}
				path="hidden"
				label={text('storage.sync_settings.hidden')}
				updateValue={() => {}}
			/>
			<p class="subtle">{text('page.files.synced.hidden_description')}</p>
		</section>
	</div>
</FormDialog>

<style>
	.sync-settings {
		display: flex;
		flex-direction: column;
		gap: 1.5em;
		width: 36em;
		max-width: 100%;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	header,
	section {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}

	.subtle {
		opacity: 0.7;
	}

	.device {
		display: grid;
		grid-template-columns: 1em 1fr auto;
		align-items: center;
		column-gap: 0.75em;
		row-gap: 0.25em;
		padding: 0.5em 0.75em;
		border: var(--border-accent);
		border-radius: 0.5em;

		.path {
			grid-column: 2 / -1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 0.85em;
		}
	}

	.syntax {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		margin: 0.5em 0 0;
		padding-left: 1.5em;
	}
</style>
