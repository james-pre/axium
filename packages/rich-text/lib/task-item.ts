import { text } from '@axium/client';
import { Icon } from '@axium/client/components';
import { TaskItem as BaseTaskItem } from '@tiptap/extension-list';
import { mount, unmount } from 'svelte';

/** A task item whose checkbox uses Axium's checkbox markup. */
export const TaskItem = BaseTaskItem.extend({
	addNodeView() {
		return ({ node, getPos, editor }) => {
			let current = node;

			const item = document.createElement('li');
			item.dataset.type = 'taskItem';

			const control = document.createElement('div');
			control.className = 'task-checkbox';
			control.contentEditable = 'false';

			const input = document.createElement('input');
			input.type = 'checkbox';
			input.id = `task-${crypto.randomUUID()}`;
			input.setAttribute('aria-label', text('RichText.task_done'));

			const label = document.createElement('label');
			label.className = 'checkbox';
			label.htmlFor = input.id;
			label.addEventListener('mousedown', event => event.preventDefault());

			const icon = mount(Icon, { target: label, props: { i: 'check' } });

			const content = document.createElement('div');
			control.append(input, label);
			item.append(control, content);

			function sync() {
				item.dataset.checked = String(current.attrs.checked);
				input.checked = current.attrs.checked;
				input.disabled = !editor.isEditable;
			}

			input.addEventListener('change', () => {
				const position = getPos();
				if (!editor.isEditable || typeof position != 'number') {
					input.checked = current.attrs.checked;
					return;
				}

				editor
					.chain()
					.focus(undefined, { scrollIntoView: false })
					.command(({ tr }) => {
						tr.setNodeMarkup(position, undefined, { ...current.attrs, checked: input.checked });
						return true;
					})
					.run();
			});

			editor.on('update', sync);
			sync();

			return {
				dom: item,
				contentDOM: content,
				update(updated) {
					if (updated.type !== current.type) return false;
					current = updated;
					sync();
					return true;
				},
				ignoreMutation: mutation => mutation.type != 'selection' && !content.contains(mutation.target),
				destroy() {
					editor.off('update', sync);
					unmount(icon);
				},
			};
		};
	},
});
