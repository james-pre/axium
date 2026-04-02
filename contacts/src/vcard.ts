import type { Contact, Init, SigDateLike } from '@axium/contacts';

function encodeDate(date: SigDateLike): string {
	const y = date.year ? String(date.year).padStart(4, '0') : '--';
	const m = date.month ? String(date.month).padStart(2, '0') : '-';
	const d = date.day ? String(date.day).padStart(2, '0') : '';
	return `${y}-${m}-${d}`;
}

export function toVCard(contact: Contact): string {
	const lines = ['BEGIN:VCARD', 'VERSION:3.0'];

	function escape(str: string | null | undefined): string {
		if (!str) return '';
		return str.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
	}

	const n = [contact.surname, contact.givenName, contact.givenName2, contact.prefix, contact.suffix];
	if (n.some(Boolean)) {
		lines.push(`N:${n.map(escape).join(';')}`);
	}

	if (contact.display) {
		lines.push(`FN:${escape(contact.display)}`);
	} else {
		const full = [contact.prefix, contact.givenName, contact.givenName2, contact.surname, contact.suffix].filter(Boolean).join(' ');
		lines.push(`FN:${escape(full) || 'Unknown'}`);
	}

	if (contact.nickname) lines.push(`NICKNAME:${escape(contact.nickname)}`);

	if (contact.company || contact.department) {
		lines.push(`ORG:${escape(contact.company)};${escape(contact.department)}`);
	}

	if (contact.jobTitle) lines.push(`TITLE:${escape(contact.jobTitle)}`);
	if (contact.notes) lines.push(`NOTE:${escape(contact.notes)}`);

	if (contact.birthYear || contact.birthMonth || contact.birthDay) {
		lines.push(`BDAY:${encodeDate({ year: contact.birthYear, month: contact.birthMonth, day: contact.birthDay })}`);
	}

	for (const url of contact.urls) {
		lines.push(`URL:${escape(url)}`);
	}

	for (const email of contact.emails) {
		const type = email.label ? `;TYPE=${escape(email.label)}` : '';
		const pref = email.isDefault ? ';TYPE=PREF' : '';
		lines.push(`EMAIL${type}${pref}:${escape(email.email)}`);
	}

	for (const phone of contact.phones) {
		const type = phone.label ? `;TYPE=${escape(phone.label)}` : '';
		const pref = phone.isDefault ? ';TYPE=PREF' : '';
		const country = phone.country ? `+${phone.country}` : '';
		lines.push(`TEL${type}${pref}:${country}${phone.number}`);
	}

	for (const addr of contact.addresses) {
		const type = addr.label ? `;TYPE=${escape(addr.label)}` : '';
		const pref = addr.isDefault ? ';TYPE=PREF' : '';
		const components = [
			'', // PO Box
			addr.street2,
			addr.street1,
			addr.locality,
			addr.subdivision,
			addr.postalCode,
			addr.country,
		];
		lines.push(`ADR${type}${pref}:${components.map(escape).join(';')}`);
	}

	for (const date of contact.dates) {
		const type = date.label ? `;TYPE=${escape(date.label)}` : '';
		lines.push(`ANNIVERSARY${type}:${encodeDate(date)}`);
	}

	for (const rel of contact.relationships) {
		// @todo get name of `to` since other software would just see the UUID
		const type = rel.label ? `;TYPE=${escape(rel.label)}` : '';
		lines.push(`RELATED${type}:${escape(rel.to)}`);
	}

	for (const custom of contact.custom) {
		const safeLabel = custom.label?.replace(/[^a-zA-Z0-9-]/g, '');
		if (!safeLabel) continue;
		lines.push(`X-${safeLabel}:${escape(custom.value)}`);
	}

	lines.push('END:VCARD');
	return lines.join('\r\n');
}
