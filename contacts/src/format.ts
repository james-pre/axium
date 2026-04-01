import type { Address, Contact, Phone } from './common.js';
import { countryName, text } from '@axium/client';

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

	return phone.country ? `+${phone.country} ${number}` : number;
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
		countryName(addr.country),
	]
		.filter(v => v)
		.join('\n');
}

export function date(day: number, month: number, year: number): string {
	month -= 1;
	return new Date(year, month, day).toLocaleDateString();
}
