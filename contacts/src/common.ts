import { $API } from '@axium/core/api';
import { Location } from '@axium/core';
import * as z from 'zod';

export const ContactEmail = z.object({
	email: z.email().max(255),
	label: z.string().max(255).nullish(),
	isDefault: z.boolean().default(false),
});
export interface ContactEmail extends z.infer<typeof ContactEmail> {}

export const ContactAddress = Location.extend({
	isDefault: z.boolean().default(false),
});
export interface ContactAddress extends z.infer<typeof ContactAddress> {}

export const ContactPhone = z.object({
	isDefault: z.boolean().default(false),
});
export interface ContactPhone extends z.infer<typeof ContactPhone> {}

export const ContactDate = z.object({});
export interface ContactDate extends z.infer<typeof ContactDate> {}

export const ContactRelationshipInit = z.object({
	to: z.uuid(),
	label: z.string().max(255).nullish(),
});

export const ContactRelationship = ContactRelationshipInit.extend({
	from: z.uuid(),
});
export interface ContactRelationship extends z.infer<typeof ContactRelationship> {}

export const ContactCustom = z.object({
	label: z.string().max(255).nullish(),
	value: z.string().max(255).nullish(),
});
export interface ContactCustom extends z.infer<typeof ContactCustom> {}

export const ContactInit = z.object({
	display: z.string().max(255).nullish(),
	prefix: z.string().max(255).nullish(),
	firstName: z.string().max(255).nullish(),
	middleName: z.string().max(255).nullish(),
	lastName: z.string().max(255).nullish(),
	suffix: z.string().max(255).nullish(),
	nickname: z.string().max(255).nullish(),
	company: z.string().max(255).nullish(),
	jobTitle: z.string().max(255).nullish(),
	department: z.string().max(255).nullish(),
	notes: z.string().max(1000).nullish(),
	birthDay: z.int().min(1).max(31).nullish(),
	birthMonth: z.int().min(1).max(12).nullish(),
	birthYear: z.int().min(0).max(9999).nullish(),
	urls: z.string().array().max(100).default([]),
	emails: ContactEmail.array().max(100).default([]),
	addresses: ContactAddress.array().max(100).default([]),
	phones: ContactPhone.array().max(100).default([]),
	dates: ContactDate.array().max(100).default([]),
	relationships: ContactRelationshipInit.array().max(100).default([]),
	custom: ContactCustom.array().max(100).default([]),
});

export const Contact = ContactInit.extend({
	id: z.uuid(),
	userId: z.uuid(),
	relationships: ContactRelationship.array().max(100).default([]),
});
export interface Contact extends z.infer<typeof Contact> {}

const ContactsAPI = {
	'users/:id/contacts': {
		GET: Contact.array(),
		PUT: [ContactInit, Contact],
	},
	'contacts/:id': {
		GET: Contact,
		PATCH: [ContactInit, Contact],
		DELETE: Contact,
	},
} as const;

type ContactsAPI = typeof ContactsAPI;

declare module '@axium/core/api' {
	export interface $API extends ContactsAPI {}
}

Object.assign($API, ContactsAPI);
