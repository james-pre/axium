<script lang="ts">
	import { fetchAPI } from '@axium/client/requests';
	import { preferenceDefaults, zIs, type Preferences, type ZodPref } from '@axium/core';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { getByString, pick, setByString } from 'utilium';
	import Icon from './Icon.svelte';
	import Preference from './Preference.svelte';

	interface Props {
		userId: string;
		preferences: Preferences;
		path: string;
		schema: ZodPref;
		optional?: boolean;
	}

	let { preferences = $bindable(), userId, path, schema, optional = false }: Props = $props();
	const id = $props.id();

	let input = $state<HTMLInputElement | HTMLSelectElement>()!;
	let checked = $state(schema.def.type == 'boolean' && getByString<boolean>(preferences, path));

	function dateAttr(date: Date | null, format: 'date' | 'time' | 'datetime' | 'time+sec') {
		if (!date) return null;

		const pad = (n: number) => String(n).padStart(2, '0');

		const yyyy = date.getFullYear();
		const mm = pad(date.getMonth() + 1);
		const dd = pad(date.getDate());
		const dateStr = `${yyyy}-${mm}-${dd}`;

		const HH = pad(date.getHours());
		const MM = pad(date.getMinutes());
		const timeStr = `${HH}:${MM}`;

		switch (format) {
			case 'date':
				return dateStr;
			case 'time':
				return timeStr;
			case 'time+sec':
				return `${timeStr}:${pad(date.getSeconds())}`;
			case 'datetime':
			default:
				return `${dateStr}T${timeStr}`;
		}
	}

	function onchange(e: Event) {
		const value = schema.parse(input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value);
		if (value == getByString(preferences, path)) return;

		if (getByString(preferenceDefaults, path) == value) {
			const parts = path.split('.');
			const prop = parts.pop()!;
			delete getByString<Record<string, any>>(preferences, parts.join('.'))[prop];
		} else setByString(preferences, path, value);

		fetchAPI('PATCH', 'users/:id', { preferences }, userId);
	}
</script>

{#snippet _in(rest: HTMLInputAttributes)}
	<input
		bind:this={input}
		{id}
		{...rest}
		value={getByString(preferences, path) ?? getByString(preferenceDefaults, path)}
		{onchange}
		required={!optional}
	/>
{/snippet}

{#if zIs(schema, 'string')}
	{@render _in({ type: schema.format == 'email' ? 'email' : 'text', ...pick(schema, 'minLength', 'maxLength') })}
{:else if zIs(schema, 'number')}
	{@render _in({ type: 'number', min: schema.minValue, max: schema.maxValue, step: schema.format?.includes('int') ? 1 : 0.1 })}
{:else if zIs(schema, 'bigint')}
	{@render _in({ type: 'number', min: Number(schema.minValue), max: Number(schema.maxValue), step: 1 })}
{:else if zIs(schema, 'boolean')}
	<input bind:checked bind:this={input} {id} type="checkbox" {onchange} required={!optional} />
	<label for={id} class="checkbox">
		{#if checked}<Icon i="check" --size="1.3em" />{/if}
	</label>
{:else if zIs(schema, 'date')}
	{@render _in({
		type: 'date',
		min: dateAttr(schema.minDate, 'date'),
		max: dateAttr(schema.maxDate, 'date'),
	})}
{:else if zIs(schema, 'file')}
	<!-- todo -->
{:else if zIs(schema, 'literal')}
	<select bind:this={input} {id} {onchange} required={!optional}>
		{#each schema.values as value}
			<option {value}>{value}</option>
		{/each}
	</select>
{:else if zIs(schema, 'template_literal')}
	<!-- todo -->
{:else if zIs(schema, 'nullable') || zIs(schema, 'optional')}
	<!-- defaults are handled differently -->
	<Preference {userId} bind:preferences {path} schema={schema.def.innerType} optional={true} />
{:else if zIs(schema, 'array')}
	<div class="pref-sub">
		{#each getByString<unknown[]>(preferences, path), i}
			<div class="pref-record-entry">
				<Preference {userId} bind:preferences path="{path}.{i}" schema={schema.element} />
			</div>
		{/each}
	</div>
{:else if zIs(schema, 'record')}
	<div class="pref-sub">
		{#each Object.keys(getByString<object>(preferences, path)) as key}
			<div class="pref-record-entry">
				<label for={id}>{key}</label>
				<Preference {userId} bind:preferences path="{path}.{key}" schema={schema.valueType} />
			</div>
		{/each}
	</div>
{:else if zIs(schema, 'object')}
	{#each Object.entries(schema.shape) as [key, value]}
		<div class="pref-sub">
			<label for={id}>{key}</label>
			<Preference {userId} bind:preferences path="{path}.{key}" schema={value} />
		</div>
	{/each}
{:else if zIs(schema, 'tuple')}
	<div class="pref-sub" data-rest={schema.def.rest}>
		{#each schema.def.items as item, i}
			<Preference {userId} bind:preferences path="{path}.{i}" schema={item} />
		{/each}
	</div>
{:else if zIs(schema, 'enum')}
	<select bind:this={input} {id} {onchange} required={!optional}>
		{#each Object.entries(schema.enum) as [key, val]}
			<option value={val}>{key}</option>
		{/each}
	</select>
{:else}
	<!-- No idea how to render this -->
	<i class="error-text">Invalid preference type: {JSON.stringify((schema as ZodPref)?.def?.type)}</i>
{/if}

<style>
	input[type='checkbox'] {
		display: none;
	}

	label.checkbox {
		cursor: pointer;
		width: 1.5em;
		height: 1.5em;
		border: 1px solid var(--border-accent);
		border-radius: 0.5em;
		display: inline-flex;
		justify-content: center;
		align-items: center;
	}
</style>
