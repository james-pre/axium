import { text } from './locales.js';

export interface ErrorLike {
	message: string;
	stack?: string;
}

export function title(error: ErrorLike | string, titleId?: string) {
	const message = typeof error == 'string' ? error : error.message;

	if (message?.includes('NetworkError')) return text('error.network.title');

	const [defaultTitle] = message?.split('\n') || [];

	return titleId ? text(titleId, { $default: defaultTitle }) : defaultTitle;
}

export function message(error: ErrorLike | string, id?: string) {
	const message = typeof error == 'string' ? error : error.message;

	if (message.includes('NetworkError')) return text('error.network.message');

	return id ? text(id, { $default: message }) : message;
}
