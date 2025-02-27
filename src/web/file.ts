import type { Stats } from '@zenfs/core';
import { basename } from '@zenfs/core/vfs/path.js';
import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('file-item')
export class FileItem extends LitElement {
	public constructor(
		public readonly path: string,
		public readonly stats: Stats
	) {
		super();
	}

	public static styles = css`
		:host {
			display: flex;
			flex-direction: column;
			gap: 0.5em;
		}

		:host(:hover) {
			background-color: #334;
		}

		.name {
			flex: 5 1 auto;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.modified {
			flex: 0 0 5em;
		}

		.size {
			flex: 1 0 5em;
		}
	`;

	public render() {
		const modified = this.stats.mtime.toLocaleString('en', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			hour12: false,
		});

		const size = this.stats.size.toLocaleString('en', {
			notation: 'compact',
			style: 'unit',
			unit: 'byte',
			unitDisplay: 'narrow',
		});

		return html`
			<p class="name">${basename(this.path)}</p>
			<p class="modified">${modified}</p>
			<p class="size">${size}</p>
		`;
	}
}
