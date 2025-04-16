import type { Actions } from '@sveltejs/kit';
import { editEmail } from '../../actions.js';

export { loadSession as load } from '../../utils.js';
export const actions = { default: editEmail } satisfies Actions;
