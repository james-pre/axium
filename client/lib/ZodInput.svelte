<script lang="ts">
	import type { ZodPref } from '@axium/core';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { getByString, pick, setByString } from 'utilium';
	import Icon from './Icon.svelte';
	import ZodInput from './ZodInput.svelte';

	interface Props {
		rootValue: any;
		path: string;
		schema: ZodPref;
		defaultValue?: any;
		optional?: boolean;
		updateValue(value: any): void;
	}

	let { rootValue = $bindable(), path, schema, optional = false, defaultValue, updateValue }: Props = $props();
	const id = $props.id();

	let input = $state<HTMLInputElement | HTMLSelectElement>()!;
	let checked = $state(schema.def.type == 'boolean' && getByString<boolean>(rootValue, path));
	const initialValue = $derived<any>(getByString(rootValue, path));

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
		const oldValue = getByString(rootValue, path);
		if (value == oldValue) return;

		if (defaultValue == value) {
			const parts = path.split('.');
			const prop = parts.pop()!;
			delete getByString<Record<string, any>>(rootValue, parts.join('.'))[prop];
		} else setByString(rootValue, path, value);

		updateValue(rootValue);
	}
</script>

{#snippet _in(rest: HTMLInputAttributes)}
	<input bind:this={input} {id} {...rest} value={initialValue} {onchange} required={!optional} {defaultValue} />
{/snippet}

{#if schema.type == 'string'}
	{@render _in({ type: schema.format == 'email' ? 'email' : 'text', ...pick(schema, 'minLength', 'maxLength') })}
{:else if schema.type == 'number'}
	{@render _in({ type: 'number', min: schema.minValue, max: schema.maxValue, step: schema.format?.includes('int') ? 1 : 0.1 })}
{:else if schema.type == 'bigint'}
	{@render _in({ type: 'number', min: Number(schema.minValue), max: Number(schema.maxValue), step: 1 })}
{:else if schema.type == 'boolean'}
	<input bind:checked bind:this={input} {id} type="checkbox" {onchange} required={!optional} />
	<label for={id} class="checkbox">
		{#if checked}<Icon i="check" --size="1.3em" />{/if}
	</label>
{:else if schema.type == 'date'}
	{@render _in({
		type: 'date',
		min: dateAttr(schema.minDate, 'date'),
		max: dateAttr(schema.maxDate, 'date'),
	})}
{:else if schema.type == 'file'}
	<!-- todo -->
{:else if schema.type == 'literal'}
	<select bind:this={input} {id} {onchange} required={!optional}>
		{#each schema.values as value}
			<option {value} selected={initialValue === value}>{value}</option>
		{/each}
	</select>
{:else if schema.type == 'template_literal'}
	<!-- todo -->
{:else if schema.type == 'default'}
	<ZodInput bind:rootValue {updateValue} {path} schema={schema.def.innerType} defaultValue={schema.def.defaultValue} />
{:else if schema.type == 'nullable' || schema.type == 'optional'}
	<!-- defaults are handled differently -->
	<ZodInput bind:rootValue {updateValue} {path} {defaultValue} schema={schema.def.innerType} optional={true} />
{:else if schema.type == 'array'}
	<div class="zod-input-sub">
		{#each initialValue, i}
			<div class="zod-input-record-entry">
				<ZodInput bind:rootValue {updateValue} {defaultValue} path="{path}.{i}" schema={schema.element} />
			</div>
		{/each}
	</div>
{:else if schema.type == 'record'}
	<div class="zod-input-sub">
		{#each Object.keys(initialValue) as key}
			<div class="zod-input-record-entry">
				<label for={id}>{key}</label>
				<ZodInput bind:rootValue {updateValue} {defaultValue} path="{path}.{key}" schema={schema.valueType} />
			</div>
		{/each}
	</div>
{:else if schema.type == 'object'}
	{#each Object.entries(schema.shape) as [key, value]}
		<div class="zod-input-sub">
			<label for={id}>{key}</label>
			<ZodInput bind:rootValue {updateValue} {defaultValue} path="{path}.{key}" schema={value} />
		</div>
	{/each}
{:else if schema.type == 'tuple'}
	<div class="zod-input-sub" data-rest={schema.def.rest}>
		{#each schema.def.items as item, i}
			<ZodInput bind:rootValue {updateValue} {defaultValue} path="{path}.{i}" schema={item} />
		{/each}
	</div>
{:else if schema.type == 'enum'}
	<select bind:this={input} {id} {onchange} required={!optional}>
		{#each Object.entries(schema.enum) as [key, value]}
			<option {value} selected={initialValue === value}>{key}</option>
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
