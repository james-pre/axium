# Axium Rich Text

A rich text editor for Axium, built on [Tiptap](https://tiptap.dev).

Documents are stored as Tiptap's JSON document model. `@axium/rich-text` has the document schema and helpers for walking and transforming documents, and doesn't depend on the editor, so servers can use it. `@axium/rich-text/components` has the editor.

## Editor

```svelte
<script lang="ts">
	import { RichText } from '@axium/rich-text/components';

	let editor: RichText;
</script>

<RichText bind:this={editor} bind:content={note.content} editable={canEdit} onchange={save} />
```

- `preset`: `document` (the default) or `email`, which leaves out task lists.
- `delay`: how long after the last edit `onchange` is called, in milliseconds.
- `editor.flush()` calls `onchange` immediately with changes still waiting for the delay. The editor also flushes when it is destroyed.
- Replacing `content` resets the editor. Use `updateNodes` to change custom nodes in place.

## Custom nodes

```ts
const taskRef = defineNode({
	name: 'task-ref',
	schema: z.object({ id: z.string(), title: z.string() }),
	render: taskRefSnippet,
	text: data => data.title,
	html: data => ({ tag: 'a', attributes: { href: `/tasks/${data.id}` } }),
	suggest: { char: '#', items: query => searchTasks(query) },
	paste: data => ({ ...data, id: crypto.randomUUID() }),
});
```

Nodes are atomic and inline. They're stored as `{ "type": "task-ref", "attrs": { "data": { ... } } }`, with `data` kept unchanged.

- `render` is a snippet that receives `{ data, selected, editable }`.
- `text` is used for the plain-text clipboard and `toText`.
- `html` is the element other apps see when the node is copied.
- `schema` validates data parsed from pasted HTML.
- `paste` transforms pasted copies, or drops them by returning `null`.

Pass custom nodes to the editor with `nodes={[taskRef]}`.

- `editor.updateNodes(taskRef, (data, index) => ...)` changes data without moving the cursor or adding to undo history. Nodes are visited in document order, and `index` counts only nodes of that type.
- `editor.wrapSelection(taskRef, text => ...)` replaces the selection with a node.

## Actions

Actions appear in the menu shown over a text selection, and in the right-click menu while text is selected. With nothing selected, the browser's own menu is shown.

```ts
const actions = [
	...formattingActions(),
	{ i: 'list-check', text: 'Make task', run: context => context.wrapSelection(taskRef, text => createTask(text)) },
];
```

## Output

- `toHTML(content, { preset, nodes })`
- `toText(content, nodes)`, or `toPlainText` from `@axium/rich-text` on the server
