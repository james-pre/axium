import { $API } from '@axium/core/api';
import { Location } from '@axium/core';
import * as z from 'zod';

const SmallTextRequired = z.string().nonempty().max(100);
const SmallText = z.string().nonempty().max(100).nullish();

export const Email = z.object({
	email: z.email().max(255),
	label: SmallText,
	isDefault: z.boolean().default(false),
});
export interface Email extends z.infer<typeof Email> {}

export const Address = Location.extend({
	isDefault: z.boolean().default(false),
});
export interface Address extends z.infer<typeof Address> {}

export const Phone = z.object({
	country: z.int().min(0).max(999).nullish(),
	number: z.coerce.bigint(),
	label: SmallText,
	isDefault: z.boolean().default(false),
});
export interface Phone extends z.infer<typeof Phone> {}

export const SigDate = z.object({
	year: z.int().min(0).max(9999).nullish(),
	month: z.int().min(1).max(12),
	day: z.int().min(1).max(31),
	label: SmallText,
});
export interface SigDate extends z.infer<typeof SigDate> {}

export const Relationship = z.object({
	to: z.uuid(),
	label: SmallTextRequired,
});
export interface Relationship extends z.infer<typeof Relationship> {}

export const Custom = z.object({
	label: SmallText,
	value: z.string().max(255),
});
export interface Custom extends z.infer<typeof Custom> {}

export const Init = z.object({
	display: SmallText,
	prefix: SmallText,
	firstName: SmallText,
	middleName: SmallText,
	lastName: SmallText,
	suffix: SmallText,
	nickname: SmallText,
	company: SmallText,
	jobTitle: SmallText,
	department: SmallText,
	notes: z.string().max(1000).nullish(),
	birthDay: z.int().min(1).max(31).nullish(),
	birthMonth: z.int().min(1).max(12).nullish(),
	birthYear: z.int().min(0).max(9999).nullish(),
	urls: z.string().max(100).array().max(100).default([]),
	emails: Email.array().max(100).default([]),
	addresses: Address.array().max(100).default([]),
	phones: Phone.array().max(100).default([]),
	dates: SigDate.array().max(100).default([]),
	relationships: Relationship.array().max(100).default([]),
	custom: Custom.array().max(100).default([]),
});

export const Contact = Init.extend({
	id: z.uuid(),
	userId: z.uuid(),
	relationships: Relationship.array().max(100).default([]),
});
export interface Contact extends z.infer<typeof Contact> {}

const ContactsAPI = {
	'users/:id/contacts': {
		GET: Contact.array(),
		PUT: [Init, Contact],
	},
	'contacts/:id': {
		GET: Contact,
		PATCH: [Init, Contact],
		DELETE: Contact,
	},
} as const;

type ContactsAPI = typeof ContactsAPI;

declare module '@axium/core/api' {
	export interface $API extends ContactsAPI {}
}

Object.assign($API, ContactsAPI);
