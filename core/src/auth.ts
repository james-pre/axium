import * as z from 'zod';

export const Session = z.object({
	id: z.uuid(),
	userId: z.uuid(),
	expires: z.coerce.date(),
	created: z.coerce.date(),
	elevated: z.boolean(),
});

export interface Session extends z.infer<typeof Session> {}

export interface Verification {
	userId: string;
	expires: Date;
}

export const VerificationRole = z.literal(['email', 'login']);

export type VerificationRole = z.infer<typeof VerificationRole>;

export interface VerificationInternal extends Verification {
	token: string;
	role: VerificationRole;
}

export interface NewSessionResponse {
	userId: string;
	token: string;
}
