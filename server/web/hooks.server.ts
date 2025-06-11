import type { Session } from '../src/auth.js';
import { loadDefaultConfigs } from '../src/config.js';

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace App {
		interface Locals {
			auth(): Promise<Session | null>;
			signIn: <Redirect extends boolean = true>(
				options?:
					| FormData
					| ({
							/** The URL to redirect to after signing in. By default, the user is redirected to the current page. */
							redirectTo?: string;
							/** If set to `false`, the `signIn` method will return the URL to redirect to instead of redirecting automatically. */
							redirect?: Redirect;
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
					  } & Record<string, any>),
				authorizationParams?: string[][] | Record<string, string> | string | URLSearchParams
			) => Promise<
				Redirect extends false
					? // eslint-disable-next-line @typescript-eslint/no-explicit-any
						any
					: never
			>;
			signOut: <Redirect extends boolean = true>(options?: {
				/** The URL to redirect to after signing out. By default, the user is redirected to the current page. */
				redirectTo?: string;
				/** If set to `false`, the `signOut` method will return the URL to redirect to instead of redirecting automatically. */
				redirect?: Redirect;
			}) => Promise<
				Redirect extends false
					? // eslint-disable-next-line @typescript-eslint/no-explicit-any
						any
					: never
			>;
		}

		interface PageData {
			session?: Session | null;
		}
	}
}

await loadDefaultConfigs();

/* 
export async function handle({ event, resolve }) {
	const _config = typeof config === 'object' ? config : await config(event);

	const { url, request } = event;

	event.locals.auth ??= () => auth(event, _config);

	const action = url.pathname.slice(_config.basePath.length + 1).split('/')[0];

	if (isAuthAction(action) && url.pathname.startsWith(_config.basePath + '/')) {
		return Auth(request, _config);
	}
	return resolve(event);
}
 */
