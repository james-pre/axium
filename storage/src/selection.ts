import { SvelteSet } from 'svelte/reactivity';

export class ItemSelection<T, V extends { id: T }> extends SvelteSet<T> {
	constructor(
		/**
		 * The list of items that can be selected.
		 */
		public items: V[]
	) {
		super([]);
	}

	public last?: T;

	public toggle(id: T): boolean {
		const has = this.has(id);
		if (has) this.delete(id);
		else {
			this.add(id);
			this.last = id;
		}
		return has;
	}

	public toggleRange(id: T) {
		const from = this.items.findIndex(item => item.id === this.last);
		const until = this.items.findIndex(item => item.id === id);
		if (from === -1 || until === -1) return;

		const range = this.items.slice(Math.min(from, until), Math.max(from, until) + 1);
		for (const item of range) this.toggle(item.id);
	}
}
