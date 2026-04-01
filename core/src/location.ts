import * as z from 'zod';
import countries from '../data/countries.json' with { type: 'json' };
import { zKeys } from './locales.js';

export type Country = (typeof countries)[number];
export { countries };

export const Location = z.object({
	/** ISO 3166-1 alpha-2 */
	country: z.literal(countries).register(zKeys, { key: 'location.country' }),
	/** ISO 3166-2. state/province/region/etc. */
	subdivision: z.string().max(255).nullish().register(zKeys, { key: 'location.subdivision' }),
	/** city/town/municipality */
	locality: z.string().max(255).nullish().register(zKeys, { key: 'location.locality' }),
	/** postal code */
	postalCode: z.string().max(255).nullish().register(zKeys, { key: 'location.postal_code' }),
	/** street address */
	street1: z.string().max(255).nullish().register(zKeys, { key: 'location.street1' }),
	street2: z.string().max(255).nullish().register(zKeys, { key: 'location.street2' }),
});

export interface Location extends z.infer<typeof Location> {}

export const LocationInit = Location.partial();
export interface LocationInit extends Partial<Location> {}

export const locationKeys = Object.keys(Location.shape) as (keyof Location)[];
