import { getCurrentSession } from '@axium/client/user';

function resolveRedirect(): string | false {
	const url = new URL(location.href);
	if (!['/login', '/register'].includes(url.pathname)) {
		console.warn('Not on login or register page, not redirecting:', url.pathname);
		return false;
	}
	const maybe = url.searchParams.get('after');
	if (!maybe || maybe == url.pathname) return '/';

	if (maybe[0] != '/' || maybe[1] == '/') {
		console.error('Ignoring potentially malicious redirect:', maybe);
		return false;
	}

	const redirect = new URL(maybe, location.origin);

	return redirect.pathname + redirect.search || '/';
}

export default async function authRedirect() {
	const redirect = resolveRedirect();

	try {
		if (!redirect) throw 'No redirect';
		// Auto-redirect if already logged in.
		const session = await getCurrentSession();
		if (session) location.href = redirect;
	} catch {}
}
