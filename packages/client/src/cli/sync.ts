import { schemas } from '../sync.js';
import { sync as syncCache } from './cache.js';

export { schemas };

export interface $Objects {}

export type ObjectType = keyof $Objects extends never ? string : keyof $Objects;

type ObjectValues = keyof $Objects extends never
	? Record<string, { id: string }[]>
	: { [K in keyof $Objects]: ($Objects[K] & { id: string })[] };

export function get<Type extends ObjectType>(type: Type): ObjectValues[Type] {
	const value = syncCache.data!.objects.filter(o => o.$type == type) as ObjectValues[Type];
	const schema = schemas.get(type);
	if (!schema) return value;
	return value.map(obj => schema.parse(obj) as ObjectValues[Type][number]);
}

/** Pull changes from the server into the local cache. */
export async function pull(): Promise<void> {
	await syncCache.update();
}
