<script lang="ts" module>
	import type { ZodPref } from '@axium/core';
	import feature from '@axium/core/features';
	import * as locales from '@james-pre/locales';

	/** The schema a modifier or composite is rendered as */
	function inner(schema: ZodPref): ZodPref | undefined {
		switch (schema.type) {
			case 'readonly':
			case 'default':
			case 'nullable':
			case 'optional':
			case 'nonoptional':
			case 'success':
				return schema.def.innerType;
			case 'pipe':
				return schema.def.in;
			case 'union':
				return schema.def.options[0];
			case 'intersection':
				return schema.def.left;
		}
	}

	function unwrap(schema: ZodPref): ZodPref {
		const next = inner(schema);
		return next ? unwrap(next) : schema;
	}

	/** The outermost translation metadata registered on a schema or the schemas it wraps */
	function infoOf(schema: ZodPref): locales.ZodInfo | undefined {
		const next = inner(schema);
		return locales.zod.get(schema) ?? (next && infoOf(next));
	}

	function isAvailable(schema: ZodPref): boolean {
		const flag = infoOf(schema)?.feature;
		if (flag && !feature(flag)) return false;
		const base = unwrap(schema);
		return base.type != 'object' || Object.values<ZodPref>(base.shape).some(isAvailable);
	}

	function isSection(schema: ZodPref): boolean {
		const { type } = unwrap(schema);
		return type == 'object' || type == 'record';
	}
</script>

<script lang="ts">
	import { text } from '@axium/client';
	import { getByString } from 'utilium';
	import ZodInput from './ZodInput.svelte';

	interface Props {
		rootValue: any;
		schema: Extract<ZodPref, { type: 'object' | 'record' }>;
		updateValue(value: any): void;
		idPrefix?: string;
		/** Where the value is in `rootValue`, which renders the form as a section when set */
		path?: string;
		label?: string;
		localeInfo?: locales.ZodInfo;
		/** Whether fields are ordered by key instead of by the schema */
		sort?: boolean;
	}

	let {
		rootValue = $bindable(),
		schema,
		updateValue,
		idPrefix,
		path = '',
		label,
		localeInfo = locales.zod.get(schema),
		sort,
	}: Props = $props();

	/** A section's `enabled` field, which disables the rest of the section when false */
	const toggle = $derived.by((): ZodPref | undefined => {
		if (!path || schema.type != 'object') return;
		const field: ZodPref | undefined = schema.shape.enabled;
		if (field && unwrap(field).type == 'boolean') return field;
	});

	function valueAt(root: any): Record<string, unknown> {
		return { ...(path ? getByString(root, path) : root) };
	}

	/** A copy of this object's value, replaced when a field changes since `rootValue` may not be deeply reactive */
	let value = $derived(valueAt(rootValue));

	function update(root: any) {
		value = valueAt(root);
		updateValue(root);
	}

	/** Whether each sibling field named in `requires` has one of the values it lists */
	function meets(requires: Record<string, readonly unknown[]>): boolean {
		if (schema.type != 'object') return true;
		return Object.entries(requires).every(([key, allowed]) => {
			const field: ZodPref | undefined = schema.shape[key];
			return !field || allowed.includes(field.safeParse(value[key]).data);
		});
	}

	const entries = $derived.by((): [string, ZodPref][] => {
		if (schema.type == 'record') return Object.keys(value).map(key => [key, schema.valueType]);

		const visible = Object.entries<ZodPref>(schema.shape).filter(([key, child]) => !(toggle && key == 'enabled') && isAvailable(child));
		if (sort) visible.sort(([a], [b]) => a.localeCompare(b));
		return [...visible.filter(([, child]) => !isSection(child)), ...visible.filter(([, child]) => isSection(child))];
	});

	function childLabel(key: string, child: ZodPref): string | undefined {
		if (schema.type == 'record' || !localeInfo?.prefix) return key;
		if (infoOf(child)?.key) return;
		return text(`${localeInfo.prefix}.${key}`);
	}
</script>

{#snippet field(key: string, child: ZodPref)}
	<ZodInput
		bind:rootValue
		updateValue={update}
		{idPrefix}
		path={path ? `${path}.${key}` : key}
		schema={child}
		label={childLabel(key, child)}
	/>
{/snippet}

{#snippet fields()}
	{#each entries as [key, child] (key)}
		{const requires = infoOf(child)?.requires}
		{#if requires}
			<fieldset class="ZodForm-requires" disabled={!meets(requires)}>{@render field(key, child)}</fieldset>
		{:else}
			{@render field(key, child)}
		{/if}
	{/each}
{/snippet}

{#if !path}
	<div class="ZodForm">{@render fields()}</div>
{:else if toggle || entries.length}
	<fieldset class="ZodForm" disabled={toggle && !meets({ enabled: [true] })}>
		<legend>
			{#if toggle}
				<ZodInput bind:rootValue updateValue={update} {idPrefix} path="{path}.enabled" schema={toggle} {label} />
			{:else}
				{label}
			{/if}
		</legend>
		{@render fields()}
	</fieldset>
{/if}

<style>
	.ZodForm {
		display: grid;
		grid-template-columns: fit-content(50%) minmax(0, 30em);
		align-items: center;
		gap: 0.75em 1.5em;
	}

	fieldset.ZodForm {
		grid-column: 1 / -1;
		grid-template-columns: subgrid;
		margin: 0.75em 0 0;
		padding: 0;
		border: none;
		min-width: 0;

		&:disabled {
			color: inherit;
			cursor: auto;

			> :not(legend) {
				color: var(--fg-disabled);
			}
		}
	}

	.ZodForm-requires {
		display: contents;
	}

	legend {
		padding: 0 0 0.75em;
		font-weight: bold;

		> :global(.ZodInput) {
			display: inline-flex;
			flex-direction: row-reverse;
			align-items: center;
			gap: 0.5em;
		}
	}
</style>
