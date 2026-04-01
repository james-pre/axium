import { Location, serverConfigs } from '@axium/core';
import { $API } from '@axium/core/api';
import { zKeys } from '@axium/core/locales';
import * as z from 'zod';

const SmallText = z.string().nonempty().max(100);

const LabelRequired = SmallText.clone().register(zKeys, { key: 'contact.label' });
const Label = SmallText.nullish().register(zKeys, { key: 'contact.label' });
const IsDefault = z.boolean().default(false).register(zKeys, { key: 'contact.default' });
const Day = z.coerce.number().int().min(1).max(31);
const Month = z.coerce.number().int().min(1).max(12);
const Year = z.coerce.number().int().min(1).max(9999).nullish();
const DatePartNull = z.coerce
	.number()
	.int()
	.min(0)
	.max(0)
	.transform(() => null);

export const ContactURL = z.url().max(100);

export const Email = z.object({
	email: z.email().max(255).register(zKeys, { key: 'contact.email' }),
	label: Label,
	isDefault: IsDefault,
});
export interface Email extends z.infer<typeof Email> {}

export const Address = Location.extend({
	label: Label,
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
	birthDay: Day.or(DatePartNull).nullish(),
	birthMonth: Month.or(DatePartNull).nullish(),
	birthYear: Year.or(DatePartNull),
	urls: ContactURL.array().max(100).default([]),
	emails: Email.array().max(100).default([]),
	addresses: Address.array().max(100).default([]),
	phones: Phone.array().max(100).default([]),
	dates: SigDate.array().max(100).default([]),
	relationships: Relationship.array().max(100).default([]),
	custom: Custom.array().max(100).default([]),
	linkedUserId: z.uuid().nullish(),
});
export interface Init extends z.infer<typeof Init> {}

export const Contact = Init.extend({
	id: z.uuid(),
	userId: z.uuid(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
export interface Contact extends z.infer<typeof Contact> {}

const _externalFields = {
	addresses: true,
	emails: true,
	phones: true,
	dates: true,
	relationships: true,
	custom: true,
} as const;

/**
 * Large contact fields, which are stored externally
 */
export const OnlyExternal = Contact.pick(_externalFields);

/**
 * Large contact fields, which are stored externally
 */
export interface OnlyExternal {
	addresses: Address[];
	emails: Email[];
	phones: Phone[];
	dates: SigDate[];
	relationships: Relationship[];
	custom: Custom[];
}

export type ExternalField = keyof OnlyExternal;

/**
 * Contact init fields that are not stored externally
 */
export interface InitNoExternal extends Omit<Init, ExternalField> {}

export const InitNoExternal = Init.omit(_externalFields);

/**
 * Contact fields that are not stored externally
 */
export interface NoExternal extends Omit<Contact, ExternalField> {}

export const NoExternal = Contact.omit(_externalFields);

const ContactsConfig = z.object({
	auto_link: z.boolean(),
});

declare module '@axium/core/plugins' {
	export interface $PluginConfigs {
		'@axium/contacts': z.infer<typeof ContactsConfig>;
	}
}

serverConfigs.set('@axium/contacts', ContactsConfig);

const ContactsAPI = {
	'users/:id/contacts': {
		GET: Contact.array(),
		PUT: [Init, Contact],
	},
	'contact-discovery': {
		POST: [z.string(), NoExternal.array()],
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
