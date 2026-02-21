<script lang="ts">
	import type { EventInitProp } from '@axium/calendar/client';
	import type { Event } from '@axium/calendar/common';
	import { eventToICS, formatEventTimes } from '@axium/calendar/common';
	import { contextMenu } from '@axium/client/attachments';
	import { Icon, Popover } from '@axium/client/components';
	import { colorHashHex, decodeColor, encodeColor } from '@axium/core/color';
	import { download } from 'utilium/dom.js';

	let {
		event,
		eventEditId = $bindable(),
		eventEditCalId = $bindable(),
		eventInit = $bindable(),
		initData = event,
	}: {
		event: Event;
		eventInit: EventInitProp;
		eventEditId: string;
		eventEditCalId: string;
		initData?: Event;
	} = $props();

	const id = $props.id();
</script>

<Popover {id} onclick={e => e.stopPropagation()}>
	{#snippet toggle()}
		{@const start = event.start.getHours() * 60 + event.start.getMinutes()}
		{@const end = event.end.getHours() * 60 + event.end.getMinutes()}
		<div
			class="Event"
			style:top="{start / 14.4}%"
			style:height="{(end - start) / 14.4}%"
			style="--event-color:{decodeColor(
				event.color || event.calendar!.color || encodeColor(colorHashHex(event.calendar!.name), true)
			)}"
			{@attach contextMenu(
				{
					i: 'pencil',
					text: 'Edit',
					action: () => {
						eventEditId = event.id;
						eventEditCalId = event.calId;
						eventInit = initData;
						document.querySelector<HTMLDialogElement>('#event-init')!.showModal();
					},
				},
				{
					i: 'file-export',
					text: 'Export .ics',
					action: () => download(event.summary + '.ics', eventToICS(event)),
				},
				{
					i: 'trash-can',
					text: 'Delete',
					action: () => {
						eventEditId = event.id;
						document.querySelector<HTMLDialogElement>('#event-delete')!.showModal();
					},
				}
			)}
		>
			<span>{event.summary}</span>
			<span class="subtle">{formatEventTimes(event)}</span>
		</div>
	{/snippet}

	<div class="event-actions">
		<button
			class="reset"
			onclick={() => {
				eventEditId = event.id;
				eventEditCalId = event.calId;
				eventInit = initData;
			}}
			command="show-modal"
			commandfor="event-init"><Icon i="pencil" /></button
		>
		<button class="reset" onclick={() => download(event.summary + '.ics', eventToICS(event))}><Icon i="file-export" /></button>
		<button class="reset" onclick={() => (eventEditId = event.id)} command="show-modal" commandfor="event-delete"
			><Icon i="trash-can" /></button
		>
		<button class="reset" command="hide-popover" commandfor={id}><Icon i="xmark" /></button>
	</div>

	<h3>{event.summary}</h3>

	<div>
		<Icon i="clock" />
		<span>
			{#if event.start.getDate() == event.end.getDate()}
				{event.start.toLocaleDateString()}, {formatEventTimes(event)}
			{:else if event.isAllDay}
				{event.start.toLocaleDateString()} - {event.end.toLocaleDateString()}
			{:else}
				{event.start.toLocaleString()} - {event.end.toLocaleString()}
			{/if}
		</span>
	</div>

	{#if event.location}
		<div>
			<Icon i="location-dot" />
			<span>{event.location}</span>
		</div>
	{/if}

	<div>
		<Icon i="calendar" />
		<span>
			{#if event.calendar}
				{event.calendar.name}
			{:else}
				<i>Unknown Calendar</i>
			{/if}
		</span>
	</div>

	{#if event.attendees.length}
		<div class="attendees-container">
			<Icon i="user-group" />
			<div class="attendees">
				{#each event.attendees ?? [] as attendee (attendee.email)}
					<div class="attendee">{attendee.email}</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if event.description}
		<div class="description">
			<Icon i="block-quote" />
			<span>{event.description}</span>
		</div>
	{/if}
</Popover>

<style>
	.Event {
		width: calc(100% - 0.5em);
		position: absolute;
		border-radius: 0.5em;
		padding: 0.25em;
		background-color: var(--event-color, var(--bg-alt));
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: flex-start;
		container-type: size;
		overflow: hidden;

		@container (height < 2.5em) {
			.subtle {
				display: none;
			}
		}

		:global(& + :popover-open) {
			gap: 0.75em;
			padding: 1em;

			.event-actions {
				display: flex;
				align-items: center;
				justify-content: flex-end;
				gap: 0.25em;

				button {
					padding: 0.5em;
					border-radius: 0.5em;
				}
			}
		}
	}
</style>
