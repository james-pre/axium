import { countryName, currentLocale } from '@axium/client';
import type { Address, Contact, InitNoExternal, Phone, SigDateLike } from '../common.js';

/**
 * Display name for contact
 * @todo localize
 */
export function name(contact: InitNoExternal): string {
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

export function phoneLink(phone: Phone): string {
	return `tel:${phone.country ? '+' + phone.country : ''}${phone.number}`;
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

export function birthDate(contact: Contact): string {
	return date({
		year: contact.birthYear,
		month: contact.birthMonth,
		day: contact.birthDay,
	});
}

export function date(sig: SigDateLike): string {
	const date = new Date(sig.year ?? 0, sig.month ? sig.month - 1 : 0, sig.day ?? undefined);
	if (sig.year && sig.month && sig.day) return date.toLocaleDateString(currentLocale, { year: 'numeric', month: 'long', day: 'numeric' });
	if (sig.year && sig.month) return date.toLocaleDateString(currentLocale, { year: 'numeric', month: 'long' });
	if (sig.month && sig.day) return date.toLocaleDateString(currentLocale, { month: 'long', day: 'numeric' });
	return '';
}

export function job(contact: InitNoExternal): string {
	return [contact.jobTitle, contact.company].filter(v => v).join(', ');
}
