export interface TriggerModifiers {
	ctrl?: boolean;
	shift?: boolean;
	alt?: boolean;
	meta?: boolean;
}

export interface MouseTrigger extends TriggerModifiers {
	button: number;
}

/** @see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/location */
export const enum KeyLocation {
	Standard,
	Left,
	Right,
	Numpad,
}

export interface KeyboardTrigger extends TriggerModifiers {
	key: string;
	location?: KeyLocation;
}

export type Trigger = KeyboardTrigger | MouseTrigger;

export interface WithAction<TData extends unknown[]> {
	action(...args: TData): unknown;
}

export interface KeyboardHandler<TData extends unknown[]> extends KeyboardTrigger, WithAction<TData> {}

export interface MouseHandler<TData extends unknown[]> extends MouseTrigger, WithAction<TData> {}

export type Handler<TData extends unknown[]> = KeyboardHandler<TData> | MouseHandler<TData>;

export function isMatch(trigger: Trigger, event: KeyboardEvent | MouseEvent): boolean {
	if (
		('ctrl' in trigger && trigger.ctrl !== event.ctrlKey) ||
		('shift' in trigger && trigger.shift !== event.shiftKey) ||
		('alt' in trigger && trigger.alt !== event.altKey) ||
		('meta' in trigger && trigger.meta !== event.metaKey)
	)
		return false;

	return 'key' in trigger
		? 'key' in event && event.key === trigger.key && (!('location' in trigger) || trigger.location === event.location)
		: 'button' in event && event.button === trigger.button;
}

export function find<T extends Trigger>(triggers: T[], event: KeyboardEvent | MouseEvent): T | undefined {
	for (const trigger of triggers) {
		if (isMatch(trigger, event)) return trigger;
	}
}
