import { countryName, currentLocale } from '@axium/client';
import type { Address, Contact, Phone, Relationship, SigDate } from './common.js';
import { getContact } from './client.js';

/**
 * Display name for contact
 * @todo localize
 */
export function name(contact: Contact): string {
	if (contact.display) return contact.display;

	return [contact.prefix, contact.givenName, contact.givenName2, contact.surname, contact.suffix].filter(v => v).join(' ');
}

/** Get formatted primary email, if one exists */
export function emailDefault(contact: Contact): string {
	if (!contact.emails.length) return '';

	const defaultValue = contact.emails.find(email => email.isDefault);

	if (!defaultValue) throw new Error('BUG: Contact has emails but none are the default');

	return defaultValue.email;
}

/**
 * @todo localize this to support more than US-style 10 digit numbers
 */
export function phone(phone: Phone): string {
	const str = phone.number.toString();
	const number = `(${str.slice(0, 3)}) ${str.slice(3, 6)}-${str.slice(6, 10)}`;

	const text = phone.country ? `+${phone.country} ${number}` : number;
	return [text, phone.label && '• ' + phone.label, phone.isDefault && '(default)'].filter(v => v).join(' ');
}

export function phoneDefault(contact: Contact): string {
	if (!contact.phones.length) return '';

	const ph = contact.phones.find(phone => phone.isDefault);

	if (!ph) throw new Error('BUG: Contact has phones but none are the default');

	return phone(ph);
}

/**
 * @todo localize
 */
export function address(addr: Address): string {
	return [
		addr.street1,
		addr.street2,
		[addr.locality, addr.subdivision, addr.postalCode].filter(v => v).join(', '),
		[countryName(addr.country), addr.label && '• ' + addr.label, addr.isDefault && '(default)'].filter(v => v).join(' '),
	]
		.filter(v => v)
		.join('\n');
}

export function birthDate(contact: Contact): string {
	return date({
		year: contact.birthYear,
		month: contact.birthMonth,
		day: contact.birthDay,
	});
}

interface SigDateLike {
	year?: number | null;
	month?: number | null;
	day?: number | null;
	label?: string | null;
}

export function date(sig: SigDateLike): string {
	const date = new Date(sig.year ?? 0, sig.month ? sig.month - 1 : 0, sig.day ?? undefined);
	if (sig.year && sig.month && sig.day) return date.toLocaleDateString(currentLocale, { year: 'numeric', month: 'long', day: 'numeric' });
	if (sig.year && sig.month) return date.toLocaleDateString(currentLocale, { year: 'numeric', month: 'long' });
	if (sig.month && sig.day) return date.toLocaleDateString(currentLocale, { month: 'long', day: 'numeric' });
	return '';
}

export function job(contact: Contact): string {
	return [contact.jobTitle, contact.company].filter(v => v).join(', ');
}

export async function relationship(relationship: Relationship): Promise<string> {
	const to = await getContact(relationship.to);
	return `${name(to)} • ${relationship.label}`;
}
