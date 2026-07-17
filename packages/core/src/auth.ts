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
	token: z.base64url(),
	role: VerificationRole,
});

export interface VerificationInternal extends z.infer<typeof VerificationInternal> {}

export const NewSessionResponse = z.object({
	userId: z.uuid(),
	token: z.union([z.base64url(), z.literal('[[redacted:elevated]]')]),
});

export interface NewSessionResponse extends z.infer<typeof NewSessionResponse> {}

/** Which authentication-related features are available */
export const AuthInfo = z.object({
	recovery: z.object({
		/** Whether account recovery is enabled */
		enabled: z.boolean(),
		/** Whether accounts can be recovered using an email */
		email: z.boolean(),
	}),
});

export interface AuthInfo extends z.infer<typeof AuthInfo> {}
