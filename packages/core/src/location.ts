import * as locales from '@james-pre/locales';
import * as z from 'zod';
import countries from '../data/countries.json' with { type: 'json' };

export type Country = (typeof countries)[number];
export { countries };

export const Location = z.object({
	/** ISO 3166-1 alpha-2 */
	country: z.literal(countries).register(locales.zod, { key: 'location.country' }),
	/** ISO 3166-2. state/province/region/etc. */
	subdivision: z.string().max(255).nullish().register(locales.zod, { key: 'location.subdivision' }),
	/** city/town/municipality */
	locality: z.string().max(255).nullish().register(locales.zod, { key: 'location.locality' }),
	/** postal code */
	postalCode: z.string().max(255).nullish().register(locales.zod, { key: 'location.postal_code' }),
	/** street address */
	street1: z.string().max(255).nullish().register(locales.zod, { key: 'location.street1' }),
	street2: z.string().max(255).nullish().register(locales.zod, { key: 'location.street2' }),
});

export interface Location extends z.infer<typeof Location> {}

export const LocationInit = Location.partial();
export interface LocationInit extends Partial<Location> {}

export const locationKeys = Object.keys(Location.shape) as (keyof Location)[];
