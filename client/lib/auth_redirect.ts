import { getCurrentSession } from '@axium/client/user';

function resolveRedirect(): string | false {
	const url = new URL(location.href);
	const maybe = url.searchParams.get('after');
	if (!['/login', '/register'].includes(url.pathname)) return false;
	if (!maybe || maybe == url.pathname) return '/';

	if (maybe[0] != '/' || maybe[1] == '/') {
		console.error('Ignoring potentially malicious redirect:', maybe);
		return false;
	}

	const redirect = new URL(maybe, location.origin);

	return redirect.pathname + redirect.search || '/';
}

const redirect = resolveRedirect();

try {
	if (!redirect) throw 'No redirect';
	// Auto-redirect if already logged in.
	const session = await getCurrentSession();
	if (session) location.href = redirect;
} catch {}

export default redirect;
