import { text } from './locales.js';

export interface ErrorLike {
	message: string;
	stack?: string;
}

export function title(error: ErrorLike, titleId?: string) {
	if (error.message?.includes('NetworkError')) return text('error.network.title');

	const [defaultTitle] = error.message?.split('\n') || [];

	return titleId ? text(titleId, { $default: defaultTitle }) : defaultTitle;
}

export function message(error: ErrorLike, id?: string) {
	if (error.message.includes('NetworkError')) return text('error.network.message');

	const { message } = error;

	return id ? text(id, { $default: error.message }) : message;
}
