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

export type VerificationRole = 'verify_email' | 'login';

export interface VerificationInternal extends Verification {
	token: string;
	role: VerificationRole;
}

export interface NewSessionResponse {
	userId: string;
	token: string;
}
