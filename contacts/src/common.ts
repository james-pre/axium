import { $API } from '@axium/core/api';
import { Location } from '@axium/core';
import * as z from 'zod';
import { zKeys } from '@axium/core/locales';

const SmallText = z.string().nonempty().max(100);

const LabelRequired = SmallText.clone().register(zKeys, { key: 'contact.label' });
const Label = SmallText.nullish().register(zKeys, { key: 'contact.label' });
const IsDefault = z.boolean().register(zKeys, { key: 'contact.default' });
const Day = z.int().min(1).max(31).register(zKeys, { key: 'contact.date.day' });
const Month = z.int().min(1).max(12).register(zKeys, { key: 'contact.date.month' });
const Year = z.int().min(0).max(9999).nullish().register(zKeys, { key: 'contact.date.year' });

export const Email = z.object({
	email: z.email().max(255).register(zKeys, { key: 'contact.email' }),
	label: Label,
	isDefault: IsDefault,
});
export interface Email extends z.infer<typeof Email> {}

export const Address = Location.extend({
	isDefault: IsDefault,
});
export interface Address extends z.infer<typeof Address> {}

export const Phone = z.object({
	country: z.int().min(0).max(999).nullish(),
	number: z.coerce
		.bigint()
		// @todo check length based on country code
		.refine(val => val > 0n && val.toString().length)
		.register(zKeys, { key: 'contact.phone.number' }),
	label: Label,
	isDefault: IsDefault,
});
export interface Phone extends z.infer<typeof Phone> {}

export const SigDate = z.object({
	year: Year,
	month: Month,
	day: Day,
	label: Label,
});
export interface SigDate extends z.infer<typeof SigDate> {}

export const Relationship = z.object({
	to: z.uuid().register(zKeys, { key: 'contact.relationship.to' }),
	label: LabelRequired,
});
export interface Relationship extends z.infer<typeof Relationship> {}

export const Custom = z.object({
	label: Label,
	value: z.string().max(255).register(zKeys, { key: 'contact.custom.value' }),
});
export interface Custom extends z.infer<typeof Custom> {}

export const Init = z.object({
	display: SmallText.nullish().register(zKeys, { key: 'contact.display' }),
	prefix: SmallText.nullish().register(zKeys, { key: 'contact.prefix' }),
	givenName: SmallText.nullish().register(zKeys, { key: 'contact.given_name' }),
	givenName2: SmallText.nullish().register(zKeys, { key: 'contact.given_name_2' }),
	surname: SmallText.nullish().register(zKeys, { key: 'contact.surname' }),
	suffix: SmallText.nullish().register(zKeys, { key: 'contact.suffix' }),
	nickname: SmallText.nullish().register(zKeys, { key: 'contact.nickname' }),
	company: SmallText.nullish().register(zKeys, { key: 'contact.company' }),
	jobTitle: SmallText.nullish().register(zKeys, { key: 'contact.job_title' }),
	department: SmallText.nullish().register(zKeys, { key: 'contact.department' }),
	notes: z.string().max(1000).nullish().register(zKeys, { key: 'contact.notes' }),
	birthDay: Day.nullish(),
	birthMonth: Month.nullish(),
	birthYear: Year,
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
