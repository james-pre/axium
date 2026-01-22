import type { AuthenticatorAttachment, AuthenticatorTransportFuture } from '@simplewebauthn/server';
import * as z from 'zod';

const PasskeyTransport = z.literal([
	'ble',
	'cable',
	'hybrid',
	'internal',
	'nfc',
	'smart-card',
	'usb',
] satisfies AuthenticatorTransportFuture[]);

export const authenticatorAttachment = z.literal(['platform', 'cross-platform'] satisfies AuthenticatorAttachment[]).optional();

const PublicKeyCredentialType = z.literal(['public-key']);

/**
 * https://w3c.github.io/webauthn/#dictdef-publickeycredentialuserentityjson
 */
const PublicKeyCredentialUserEntity = z.object({
	id: z.string(),
	name: z.string(),
	displayName: z.string(),
});

/**
 * https://w3c.github.io/webauthn/#dictdef-publickeycredentialdescriptorjson
 */
const PublicKeyCredentialDescriptor = z.object({
	id: z.base64url(),
	type: PublicKeyCredentialType,
	transports: PasskeyTransport.array().optional(),
});

const UserVerificationRequirement = z.literal(['required', 'preferred', 'discouraged']);

const AuthenticationExtensionsClientInputs = z.object({
	appid: z.string().optional(),
	credProps: z.boolean().optional(),
	hmacCreateSecret: z.boolean().optional(),
	minPinLength: z.boolean().optional(),
});

/**
 * ak/a/ `PublicKeyCredentialRequestOptionsJSON`
 */
export const PasskeyAuthOptions = z.object({
	challenge: z.base64url(),
	timeout: z.number().optional(),
	rpId: z.string().optional(),
	allowCredentials: PublicKeyCredentialDescriptor.array().optional(),
	userVerification: UserVerificationRequirement.optional(),
	extensions: AuthenticationExtensionsClientInputs.optional(),
});

const PublicKeyCredentialRpEntity = z.object({
	id: z.string().optional(),
	name: z.string(),
});

const COSEAlgorithmIdentifier = z.number();

const PublicKeyCredentialParameters = z.object({
	alg: COSEAlgorithmIdentifier,
	type: PublicKeyCredentialType,
});

const ResidentKeyRequirement = z.literal(['required', 'preferred', 'discouraged']);

const AuthenticatorSelectionCriteria = z.object({
	authenticatorAttachment: authenticatorAttachment.optional(),
	requireResidentKey: z.boolean().optional(),
	residentKey: ResidentKeyRequirement.optional(),
	userVerification: UserVerificationRequirement.optional(),
});

const AttestationConveyancePreference = z.literal(['none', 'indirect', 'direct', 'enterprise']);

/**
 * a/k/a `PublicKeyCredentialCreationOptionsJSON`
 */
export const PasskeyCreationOptions = z.object({
	rp: PublicKeyCredentialRpEntity,
	user: PublicKeyCredentialUserEntity,
	challenge: z.base64url(),
	pubKeyCredParams: PublicKeyCredentialParameters.array(),
	timeout: z.number().optional(),
	excludeCredentials: PublicKeyCredentialDescriptor.array().optional(),
	authenticatorSelection: AuthenticatorSelectionCriteria.optional(),
	attestation: AttestationConveyancePreference.optional(),
});

export const PasskeyRegistration = z.object({
	id: z.string(),
	rawId: z.string(),
	response: z.object({
		clientDataJSON: z.string(),
		attestationObject: z.string(),
		authenticatorData: z.string().optional(),
		transports: PasskeyTransport.array().optional(),
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
export const PasskeyAuthResponse = z.object({
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

export const Passkey = z.object({
	id: z.string(),
	name: z.string().nullish(),
	createdAt: z.coerce.date(),
	userId: z.uuid(),
	deviceType: z.literal(['singleDevice', 'multiDevice']),
	backedUp: z.boolean(),
	transports: z.literal(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']).array(),
});

export interface Passkey extends z.infer<typeof Passkey> {}
