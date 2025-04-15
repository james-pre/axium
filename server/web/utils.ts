import { fail, type ActionFailure } from '@sveltejs/kit';
import type * as z from 'zod';

export function failZod(error: z.ZodError): ActionFailure<{ error: string }> {
	return fail(400, {
		error: error.flatten().formErrors[0] || Object.values(error.flatten().fieldErrors).flat()[0],
	});
}

export function tryZod<Input, Output>(result: z.SafeParseReturnType<Input, Output>): [Output?, ActionFailure<{ error: string }>?] {
	if (result.success) return [result.data, undefined];
	return [undefined, failZod(result.error)];
}
