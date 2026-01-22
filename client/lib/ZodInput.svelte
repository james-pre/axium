<script lang="ts">
	import type { ZodPref } from '@axium/core';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { getByString, pick, setByString } from 'utilium';
	import Icon from './Icon.svelte';
	import ZodInput from './ZodInput.svelte';
	import { prettifyError } from 'zod';

	interface Props {
		idPrefix?: string;
		rootValue: any;
		path: string;
		label?: string;
		schema: ZodPref;
		defaultValue?: any;
		optional?: boolean;
		updateValue(value: any): void;
	}

	let { rootValue = $bindable(), label, path, schema, optional = false, defaultValue, idPrefix, updateValue }: Props = $props();
	const id = (idPrefix ? idPrefix + ':' : '') + path.replaceAll(' ', '_');

	let input = $state<HTMLInputElement | HTMLSelectElement>()!;
	let value = $state<any>(getByString(rootValue, path));

	let error = $state();

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
		let val;

		try {
			val = schema.parse(value);
		} catch (e: any) {
			error = prettifyError(e);
			return;
		}

		const oldValue = getByString(rootValue, path);
		if (val == oldValue) return;

		if (defaultValue == val) {
			const parts = path.split('.');
			const prop = parts.pop()!;
			delete getByString<Record<string, any>>(rootValue, parts.join('.'))[prop];
		} else setByString(rootValue, path, val);

		updateValue(rootValue);
	}
</script>

{#snippet _in(rest: HTMLInputAttributes)}
	<div class="ZodInput">
		<label for={id}>{label || path}</label>
		{#if error}<span class="ZodInput-error error-text">{error}</span>{/if}
		<input bind:this={input} {id} {...rest} bind:value {onchange} required={!optional} {defaultValue} class={[error && 'error']} />
	</div>
{/snippet}

{#if schema.type == 'string'}
	{@render _in({ type: schema.format == 'email' ? 'email' : 'text', ...pick(schema, 'minLength', 'maxLength') })}
{:else if schema.type == 'number'}
	{@render _in({ type: 'number', min: schema.minValue, max: schema.maxValue, step: schema.format?.includes('int') ? 1 : 0.1 })}
{:else if schema.type == 'bigint'}
	{@render _in({ type: 'number', min: Number(schema.minValue), max: Number(schema.maxValue), step: 1 })}
{:else if schema.type == 'boolean'}
	<div class="ZodInput">
		<label for="{id}:checkbox">{label || path}</label>
		<input bind:checked={value} bind:this={input} id="{id}:checkbox" type="checkbox" {onchange} required={!optional} />
		<label for="{id}:checkbox" {id} class="checkbox">
			{#if value}<Icon i="check" --size="1.3em" />{/if}
		</label>
	</div>
{:else if schema.type == 'date'}
	{@render _in({
		type: 'date',
		min: dateAttr(schema.minDate, 'date'),
		max: dateAttr(schema.maxDate, 'date'),
	})}
{:else if schema.type == 'file'}
	<!-- todo -->
{:else if schema.type == 'literal'}
	<div class="ZodInput">
		<label for={id}>{label || path}</label>
		<select bind:this={input} bind:value {id} {onchange} required={!optional}>
			{#each schema.values as value}
				<option {value} selected={value === value}>{value}</option>
			{/each}
		</select>
	</div>
{:else if schema.type == 'template_literal'}
	<!-- todo -->
{:else if schema.type == 'default'}
	<ZodInput bind:rootValue {updateValue} {idPrefix} {path} schema={schema.def.innerType} defaultValue={schema.def.defaultValue} />
{:else if schema.type == 'nullable' || schema.type == 'optional'}
	<!-- defaults are handled differently -->
	<ZodInput bind:rootValue {updateValue} {idPrefix} {path} {defaultValue} schema={schema.def.innerType} optional={true} />
{:else if schema.type == 'array'}
	<div class="ZodInput">
		<label for={id}>{label || path}</label>
		{#each value, i}
			<div class="ZodInput-element">
				<ZodInput bind:rootValue {updateValue} {idPrefix} {defaultValue} path="{path}.{i}" schema={schema.element} />
			</div>
		{:else}
			<i>Empty</i>
		{/each}
	</div>
{:else if schema.type == 'record'}
	<div class="ZodInput-record">
		{#each Object.keys(value) as key}
			<div class="ZodInput-record-entry">
				<label for={id}>{key}</label>
				<ZodInput bind:rootValue {updateValue} {idPrefix} {defaultValue} path="{path}.{key}" schema={schema.valueType} />
			</div>
		{/each}
	</div>
{:else if schema.type == 'object'}
	<!-- <div class="ZodInput-object"> -->
	{#each Object.entries(schema.shape) as [key, value]}
		<ZodInput bind:rootValue {updateValue} {idPrefix} {defaultValue} path="{path}.{key}" schema={value} />
	{/each}
	<!-- </div> -->
{:else if schema.type == 'tuple'}
	<div class="ZodInput-tuple" data-rest={schema.def.rest}>
		{#each schema.def.items as item, i}
			<ZodInput bind:rootValue {updateValue} {idPrefix} {defaultValue} path="{path}.{i}" schema={item} />
		{/each}
	</div>
{:else if schema.type == 'enum'}
	<div class="ZodInput">
		<label for={id}>{label || path}</label>
		<select bind:this={input} {id} {onchange} bind:value required={!optional}>
			{#each Object.entries(schema.enum) as [key, value]}
				<option {value} selected={value === value}>{key}</option>
			{/each}
		</select>
	</div>
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

	.ZodInput-error {
		position: fixed;
		position-anchor: --zod-input;
		bottom: calc(anchor(top) - 0.3em);
		left: anchor(left);
	}

	.ZodInput {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1em;
		anchor-scope: --zod-input;

		input {
			anchor-name: --zod-input;
		}
	}

	.ZodInput-object,
	.ZodInput-record,
	.ZodInput-array,
	.ZodInput-tuple {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.25em;
	}
</style>
