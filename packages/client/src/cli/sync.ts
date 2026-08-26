import { schemas } from '../sync.js';
import { sync as syncCache } from './cache.js';

export { schemas };

export interface $Objects {}

export type ObjectType = keyof $Objects extends never ? string : keyof $Objects;

type ObjectValues = keyof $Objects extends never
	? Record<string, { id: string }[]>
	: { [K in keyof $Objects]: ($Objects[K] & { id: string })[] };

let _byType: Partial<ObjectValues>;

function byType(): Partial<ObjectValues> {
	_byType ||= Object.groupBy(syncCache.data!.objects, o => o.$type);
	return _byType;
}

export function get<Type extends ObjectType>(type: Type): ObjectValues[Type] {
	const value = byType()[type] || [];
	const schema = schemas.get(type);
	if (!schema) return value;
	return value.map(obj => schema.parse(obj) as ObjectValues[Type][number]);
}

export function save<Type extends ObjectType>(type: Type, objects: ObjectValues[Type]): void {
	_byType ||= {};
	_byType[type] = objects;
	syncCache.data!.objects = syncCache.data!.objects.filter(o => o.$type !== type);
	for (const object of objects) syncCache.data!.objects.push(Object.assign(object, { $type: type }));
}
