import { json } from '@sveltejs/kit';

export function GET() {
	return json({
		version: 'prototype',
	});
}
