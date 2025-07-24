import * as z from 'zod';
import type { AuthenticatorTransportFuture, AuthenticatorAttachment } from '@simplewebauthn/server';

export function zFunction<T extends z.core.$ZodFunction>(schema: T) {
	return z.custom<Parameters<T['implement']>[0]>((fn: any) => schema.implement(fn));
}

export function zAsyncFunction<T extends z.core.$ZodFunction>(schema: T) {
	return z.custom<Parameters<T['implementAsync']>[0]>((fn: any) => schema.implementAsync(fn));
}

const transports = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'] satisfies AuthenticatorTransportFuture[];

export const authenticatorAttachment = z.literal(['platform', 'cross-platform'] satisfies AuthenticatorAttachment[]).optional();

export const PasskeyRegistration = z.object({
	id: z.string(),
	rawId: z.string(),
	response: z.object({
		clientDataJSON: z.string(),
		attestationObject: z.string(),
		authenticatorData: z.string().optional(),
		transports: z.array(z.enum(transports)).optional(),
		publicKeyAlgorithm: z.number().optional(),
		publicKey: z.string().optional(),
	}),
	authenticatorAttachment,
	clientExtensionResults: z.record(z.any(), z.any()),
	type: z.literal('public-key'),
});

/**
 * POSTed to the `/users/:id/login` endpoint.
 */
export const PasskeyAuthenticationResponse = z.object({
	id: z.string(),
	rawId: z.string(),
	response: z.object({
		clientDataJSON: z.string(),
		authenticatorData: z.string(),
		signature: z.string(),
		userHandle: z.string().optional(),
	}),
	authenticatorAttachment,
	clientExtensionResults: z.record(z.any(), z.any()),
	type: z.literal('public-key'),
});

export const APIUserRegistration = z.object({
	name: z.string().min(1).max(100),
	email: z.email(),
	userId: z.uuid(),
	response: PasskeyRegistration,
});

export const PasskeyChangeable = z.object({ name: z.string() }).partial();

export const UserAuthOptions = z.object({ type: z.literal(['login', 'action']) });

export type UserAuthOptions = z.infer<typeof UserAuthOptions>;

export const LogoutSessions = z.object({
	id: z.array(z.uuid()).optional(),
	confirm_all: z.boolean().optional(),
});
