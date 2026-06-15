import { SvelteSet } from 'svelte/reactivity';

interface StoredClipboard<T extends string | boolean | bigint | number> {
	isCopy: boolean;
	values: T[];
}

/**
 * A reactive, cross-tab clipboard for "cut" and "copy" of values.
 *
 * State is mirrored to `localStorage` so it is shared across all tabs of the origin.
 */
export class SyncedClipboard<T extends string | boolean | bigint | number> extends SvelteSet<T> {
	/** The current clipboard mode, or `undefined` when the clipboard is empty. Reactive. */
	isCopy = $state<boolean>();

	constructor(protected readonly key = 'clipboard') {
		super();

		this.load();

		addEventListener('storage', e => {
			if (e.key == this.key) this.load();
		});
	}

	/** Whether the clipboard currently holds anything. */
	get active(): boolean {
		return typeof this.isCopy === 'boolean' && this.size > 0;
	}

	/** Place the given values on the clipboard to be moved on paste. */
	cut(values: Iterable<T>): void {
		this.isCopy = false;
		this.set([...values]);
	}

	/** Place the given values on the clipboard to be duplicated on paste. */
	copy(values: Iterable<T>): void {
		this.isCopy = true;
		this.set([...values]);
	}

	/** Empty the clipboard. */
	clear(): void {
		this.isCopy = undefined;
		super.clear();
		if (typeof localStorage != 'undefined') localStorage.removeItem(this.key);
	}

	protected set(values: T[]): void {
		super.clear();
		for (const value of values) this.add(value);
		if (typeof localStorage != 'undefined')
			localStorage.setItem(this.key, JSON.stringify({ isCopy: this.isCopy!, values } satisfies StoredClipboard<T>));
	}

	protected load(): void {
		if (typeof localStorage == 'undefined') return;

		const raw = localStorage.getItem(this.key);
		if (!raw) {
			this.isCopy = undefined;
			super.clear();
			return;
		}

		try {
			const { isCopy, values } = JSON.parse(raw) as StoredClipboard<T>;
			this.isCopy = isCopy;
			for (const value of this) if (!values.includes(value)) this.delete(value);
			for (const value of values) this.add(value);
		} catch {
			this.clear();
		}
	}
}
