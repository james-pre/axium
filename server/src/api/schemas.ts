import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import z from 'zod/v4';

const transports = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'] satisfies AuthenticatorTransportFuture[];

export const authenticatorAttachment = z.enum(['platform', 'cross-platform'] satisfies AuthenticatorAttachment[]).optional();

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
