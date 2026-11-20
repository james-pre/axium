<script lang="ts" module>
	/** `unreachable` means the browser could not load the editor at all, usually because of the document server's certificate */
	export type EditorStatus = 'loading' | 'ready' | 'failed' | 'unreachable';

	interface DocEditor {
		destroyEditor(): void;
	}

	interface DocsAPI {
		DocEditor: new (elementId: string, config: object) => DocEditor;
	}

	declare global {
		interface Window {
			DocsAPI?: DocsAPI;
		}
	}

	/** Loads the editor API from the document server, once per page */
	async function loadAPI(serverURL: string): Promise<DocsAPI> {
		if (window.DocsAPI) return window.DocsAPI;

		const script = document.createElement('script');
		script.src = serverURL.replace(/\/$/, '') + '/web-apps/apps/api/documents/api.js';

		const { promise, resolve, reject } = Promise.withResolvers<void>();
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('Could not load the document server API'));
		document.head.append(script);
		await promise;

		return window.DocsAPI!;
	}
</script>

<script lang="ts">
	import type { Editor } from '@axium/office/common';

	const { editor, onstatus }: { editor: Editor; onstatus(status: EditorStatus): void } = $props();

	/** The document server replaces this element with its frame */
	const elementId = 'document-editor';

	async function mount(): Promise<DocEditor | undefined> {
		const api = await loadAPI(editor.url).catch(() => onstatus('unreachable'));
		if (!api) return;

		return new api.DocEditor(elementId, {
			...editor.config,
			width: '100%',
			height: '100%',
			events: {
				onDocumentReady: () => onstatus('ready'),
				onError: () => onstatus('failed'),
			},
		});
	}

	$effect(() => {
		const mounting = mount();
		return () => void mounting.then(docEditor => docEditor?.destroyEditor());
	});
</script>

<div class="host">
	<div id={elementId}></div>
</div>

<style>
	.host {
		height: 100%;
	}
</style>
