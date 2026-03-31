import * as z from 'zod';

export const Location = z.object({
	/** ISO 3166-1 alpha-2 */
	country: z.string().length(2),
	/** ISO 3166-2. state/province/region/etc. */
	subdivision: z.string().max(255).nullish(),
	/** city/town/municipality */
	locality: z.string().max(255).nullish(),
	/** postal code */
	postalCode: z.string().max(255).nullish(),
	/** street address */
	street1: z.string().max(255).nullish(),
	street2: z.string().max(255).nullish(),
});

export interface Location extends z.infer<typeof Location> {}

export const LocationInit = Location.partial();
export interface LocationInit extends Partial<Location> {}

export const locationKeys = Object.keys(Location.shape) as (keyof Location)[];
