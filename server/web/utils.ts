import { fail, type ActionFailure } from '@sveltejs/kit';
import type * as z from 'zod';

export function failZod<T extends Record<string, unknown>>(error: z.ZodError, data: T = {} as T): ActionFailure<T & { error: string }> {
	return fail(400, {
		...data,
		error: error.flatten().formErrors[0] || Object.values(error.flatten().fieldErrors).flat()[0],
	});
}

export function tryZod<Input, Output>(result: z.SafeParseReturnType<Input, Output>): [Output, null] | [null, ActionFailure<Partial<Output> & { error: string }>] {
	if (result.success) return [result.data, null];
	return [null, failZod(result.error)];
}
