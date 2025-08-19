import type { AuthenticatorAttachment, AuthenticatorTransportFuture } from '@simplewebauthn/server';
import type { CredentialDeviceType } from '@simplewebauthn/types';
import * as z from 'zod';

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

export const PasskeyChangeable = z.object({ name: z.string() }).partial();

export interface Passkey {
	id: string;
	name?: string | null;
	createdAt: Date;
	userId: string;
	deviceType: CredentialDeviceType;
	backedUp: boolean;
	transports: AuthenticatorTransportFuture[];
}
