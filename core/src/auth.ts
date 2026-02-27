import * as z from 'zod';

export const Session = z.object({
	id: z.uuid(),
	userId: z.uuid(),
	name: z.string().nullish(),
	expires: z.coerce.date(),
	created: z.coerce.date(),
	elevated: z.boolean(),
});

export interface Session extends z.infer<typeof Session> {}

export const Verification = z.object({
	userId: z.uuid(),
	expires: z.coerce.date(),
});

export interface Verification extends z.infer<typeof Verification> {}

export const VerificationRole = z.literal(['email', 'login']);

export type VerificationRole = z.infer<typeof VerificationRole>;

export const VerificationInternal = Verification.extend({
	token: z.string(),
	role: VerificationRole,
});

export interface VerificationInternal extends z.infer<typeof VerificationInternal> {}

export const NewSessionResponse = z.object({
	userId: z.uuid(),
	token: z.string(),
});

export interface NewSessionResponse extends z.infer<typeof NewSessionResponse> {}
