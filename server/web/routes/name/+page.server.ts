import type { Actions } from '@sveltejs/kit';
import { editName } from '../../actions.js';

export { loadSession as load } from '../../utils.js';
export const actions = { default: editName } satisfies Actions;
