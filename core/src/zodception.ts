/**
 * Zodception:
 * This module contains Zod schemas that allow you to describe Zod schemas using JSON,
 * which could in turn be a schema for data stored in a JSON file...
 *
 * This was really painful to write.
 */

import type { Entries, Expand, ExtractProperties, UnionToTuple } from 'utilium';
import * as z from 'zod';

type ZodSchemaName = Exclude<keyof ExtractProperties<typeof z, (...args: any[]) => z.ZodType>, 'fromJSONSchema'>;
type ZodCoerceSchemaName = keyof ExtractProperties<(typeof z)['coerce'], () => z.ZodType>;

const coercibleTypes = ['string', 'number', 'bigint', 'boolean', 'date'] satisfies UnionToTuple<ZodCoerceSchemaName>;

const BaseShape = {
	optional: z.boolean().or(z.literal('exact')).optional(),
	nullable: z.boolean().optional(),
	nullish: z.boolean().optional(),
	default: z.any().optional(),
};

type TypeToZod<Type extends ZodSchemaName, Coerce extends boolean> = z.ZodType &
	(Coerce extends true
		? Type extends ZodCoerceSchemaName
			? ReturnType<(typeof z)[Type]> | ReturnType<(typeof z)['coerce'][Type]>
			: never
		: ReturnType<(typeof z)[Type]>);

class Builder<Type extends ZodSchemaName, Shape extends Record<string, any> = {}, Fields extends {} = {}, Coerce extends boolean = false> {
	constructor(
		protected readonly type: Type,
		protected readonly _args: (keyof Shape)[],
		protected shape: Shape,
		/** An object mapping whether each field is a value (e.g. `.min(n)`) or not (e.g. `.lowercase`) */
		protected fields: Fields,
		protected useCoerce: Coerce
	) {}

	with<O extends {}, F extends Record<string, boolean>>(other: Builder<any, O, F, any>): Builder<any, Shape & O, Fields & F, Coerce> {
		return new Builder(this.type, this._args, { ...this.shape, ...other.shape }, { ...this.fields, ...other.fields }, this.useCoerce);
	}

	withCoerce(): Type extends ZodCoerceSchemaName ? Builder<Type, Shape, Fields, true> : never {
		if (!coercibleTypes.includes(this.type as any)) throw 'Type is not coercible: ' + this.type;
		return new Builder(this.type, this._args, this.shape, this.fields, true) as any;
	}

	/**
	 * Define arguments to pass to schema function. note these are position independent
	 *
	 * @example
	 * ```ts
	 * new Builder('discriminatedUnion')
	 * .arg('key', z.string())
	 * .arg('of', z.record(z.any(), z.any()).array())
	 * ```
	 */
	arg<K extends string, V extends z.ZodType>(name: K, valueSchema: V): Builder<Type, Shape & { [_k in K]: V }, Fields, Coerce> {
		return new Builder<Type, Shape & { [_k in K]: V }, Fields, Coerce>(
			this.type,
			[...this._args, name],
			{ ...this.shape, [name]: valueSchema } as any as Shape & { [_k in K]: V },
			this.fields,
			this.useCoerce
		);
	}

	value<K extends string, V extends z.ZodType>(
		name: K,
		valueSchema: V
	): Builder<Type, Expand<Shape & { [_k in K]: z.ZodOptional<V> }>, Expand<Fields & { [_k in K]: true }>, Coerce> {
		return new Builder<Type, any, any, Coerce>(
			this.type,
			this._args,
			{ ...this.shape, [name]: valueSchema.optional() } as any,
			{ ...this.fields, [name]: true } as any as Fields & { [_k in K]: true },
			this.useCoerce
		);
	}

	fn<K extends string>(
		name: K
	): Builder<Type, Expand<Shape & { [_k in K]: z.ZodOptional<z.ZodBoolean> }>, Expand<Fields & { [_k in K]: false }>, Coerce> {
		return new Builder<Type, any, any, Coerce>(
			this.type,
			this._args,
			{ ...this.shape, [name]: z.boolean().optional() } as any,
			{ ...this.fields, [name]: false } as any as Fields & { [_k in K]: false },
			this.useCoerce
		);
	}

	toZod<Z extends z.ZodType = TypeToZod<Type, Coerce>>(): z.ZodPipe<
		z.ZodObject<Expand<Shape & typeof BaseShape & { coerce?: z.ZodOptional<z.ZodBoolean>; type: z.ZodLiteral<Type> }>>,
		z.ZodTransform<Z, any>
	> {
		return z
			.object({
				...this.shape,
				...BaseShape,
				...(this.useCoerce ? { coerce: z.boolean().optional() } : {}),
				type: z.literal(this.type),
			})
			.transform((data: any) => {
				// TS dies for some reason and forgets that the `BaseShape` properties exist, so we use `data: any`
				let schema: z.ZodType & Record<any, any> = (z[this.type] as any)(...this._args.map(k => data[k]));
				if (data.optional) schema = data.optional == 'exact' ? schema.exactOptional() : schema.optional();
				if (data.nullable) schema = schema.nullable();
				if (data.nullish) schema = schema.nullish();
				if (data.default !== undefined) schema = schema.prefault(data.default);
				for (const [key, isValue] of Object.entries(this.fields) as Entries<Fields>) {
					const value = data[key];
					if (isValue) schema = schema[key](value);
					else if (value) schema = schema[key]();
				}
				return schema as Z;
			}) as any;
	}
}

function build<Type extends ZodSchemaName>(type: Type): Builder<Type, {}> {
	return new Builder(type, [], {}, {}, false);
}

const Regex = z.string().transform(s => new RegExp(s));

const _string = build('string')
	.value('regex', Regex)
	.value('includes', z.string())
	.value('startsWith', z.string())
	.value('endsWith', z.string())
	.value('min', z.int())
	.value('max', z.int())
	.value('length', z.int())
	.fn('nonempty')
	.fn('lowercase')
	.fn('uppercase')
	.fn('trim')
	.value('normalize', z.string().nullable())
	.fn('toLowerCase')
	.fn('toUpperCase')
	.fn('slugify');

export const string = _string.toZod<z.ZodString>();

export const email = build('email').with(_string).toZod();
export const guid = build('guid').with(_string).toZod();
export const uuid = build('uuid').with(_string).toZod();
export const url = build('url').with(_string).toZod();
export const emoji = build('emoji').with(_string).toZod();
export const nanoid = build('nanoid').with(_string).toZod();
export const cuid = build('cuid').with(_string).toZod();
export const cuid2 = build('cuid2').with(_string).toZod();
export const ulid = build('ulid').with(_string).toZod();
export const xid = build('xid').with(_string).toZod();
export const ksuid = build('ksuid').with(_string).toZod();
export const ipv4 = build('ipv4').with(_string).toZod();
export const mac = build('mac').with(_string).toZod();
export const ipv6 = build('ipv6').with(_string).toZod();
export const cidrv4 = build('cidrv4').with(_string).toZod();
export const cidrv6 = build('cidrv6').with(_string).toZod();
export const base64 = build('base64').with(_string).toZod();
export const base64url = build('base64url').with(_string).toZod();
export const e164 = build('e164').with(_string).toZod();
export const jwt = build('jwt').with(_string).toZod();
export const uuidv4 = build('uuidv4').with(_string).toZod();
export const uuidv6 = build('uuidv6').with(_string).toZod();
export const uuidv7 = build('uuidv7').with(_string).toZod();
export const httpUrl = build('httpUrl').with(_string).toZod();
export const hostname = build('hostname').with(_string).toZod();
export const hex = build('hex').with(_string).toZod();

export const hash = build('hash')
	.arg('algorithm', z.literal(['md5', 'sha1', 'sha256', 'sha384', 'sha512']))
	.arg('encoding', z.literal(['hex', 'base64', 'base64url']).default('hex'))
	.with(_string)
	.toZod<z.ZodCustomStringFormat<`${z.util.HashAlgorithm}_${z.util.HashEncoding}`>>();

const _number = build('number')
	.value('gt', z.number())
	.value('gte', z.number())
	.value('min', z.number())
	.value('lt', z.number())
	.value('lte', z.number())
	.value('max', z.number())
	.fn('positive')
	.fn('nonnegative')
	.fn('negative')
	.fn('nonpositive')
	.value('multipleOf', z.number());

export const number = _number.toZod();

export const int = build('int').with(_number).toZod();
export const float32 = build('float32').with(_number).toZod();
export const float64 = build('float64').with(_number).toZod();
export const int32 = build('int32').with(_number).toZod();
export const uint32 = build('uint32').with(_number).toZod();

const _bigint = build('bigint')
	.withCoerce()
	.value('gt', z.bigint())
	.value('gte', z.bigint())
	.value('min', z.bigint())
	.value('lt', z.bigint())
	.value('lte', z.bigint())
	.value('max', z.bigint())
	.fn('positive')
	.fn('nonnegative')
	.fn('negative')
	.fn('nonpositive')
	.value('multipleOf', z.bigint());

export const bigint = _bigint.toZod();

export const int64 = build('int64').with(_bigint).toZod();
export const uint64 = build('uint64').with(_bigint).toZod();

export const boolean = build('boolean').toZod();
export const stringbool = build('stringbool').toZod();
export const date = build('date')
	.withCoerce()
	.value('min', z.union([z.number(), z.coerce.date()]))
	.value('max', z.union([z.number(), z.coerce.date()]))
	.toZod();
const _null = build('null').toZod();
export { _null as null };
export const json = build('json').toZod();
export const stringFormat = build('stringFormat').arg('id', z.string()).arg('format', Regex).with(_string).toZod();
export const literal = build('literal').arg('value', z.any()).toZod();
export const unknown = build('unknown').toZod();
export const any = build('any').toZod();
const _enum = build('enum')
	.arg('values', z.union([z.record(z.string(), z.string()), z.record(z.string(), z.number()), z.string().array()]))
	.toZod();
export { _enum as enum };

export interface primitive extends z.ZodDiscriminatedUnion<
	[
		// strings
		typeof string,
		typeof email,
		typeof guid,
		typeof uuid,
		typeof url,
		typeof emoji,
		typeof nanoid,
		typeof cuid,
		typeof cuid2,
		typeof ulid,
		typeof xid,
		typeof ksuid,
		typeof ipv4,
		typeof mac,
		typeof ipv6,
		typeof cidrv4,
		typeof cidrv6,
		typeof base64,
		typeof base64url,
		typeof e164,
		typeof jwt,
		typeof uuidv4,
		typeof uuidv6,
		typeof uuidv7,
		typeof httpUrl,
		typeof hostname,
		typeof hex,
		typeof hash,
		typeof stringFormat,

		// numbers/bigints
		typeof number,
		typeof int,
		typeof float32,
		typeof float64,
		typeof int32,
		typeof uint32,
		typeof bigint,
		typeof int64,
		typeof uint64,

		// other primitives
		typeof boolean,
		typeof stringbool,
		typeof date,
		typeof json,
		typeof _null,
		typeof literal,
		typeof unknown,
		typeof any,
		typeof _enum,
	],
	'type'
> {}

export const primitive: primitive = z.discriminatedUnion('type', [
	// strings
	string,
	email,
	guid,
	uuid,
	url,
	emoji,
	nanoid,
	cuid,
	cuid2,
	ulid,
	xid,
	ksuid,
	ipv4,
	mac,
	ipv6,
	cidrv4,
	cidrv6,
	base64,
	base64url,
	e164,
	jwt,
	uuidv4,
	uuidv6,
	uuidv7,
	httpUrl,
	hostname,
	hex,
	hash,
	stringFormat,

	// numbers/bigints
	number,
	int,
	float32,
	float64,
	int32,
	uint32,
	bigint,
	int64,
	uint64,

	// other primitives
	boolean,
	stringbool,
	date,
	json,
	_null,
	literal,
	unknown,
	any,
	_enum,
]);
export type primitiveInput = z.input<typeof primitive>;
export type primitiveZod = z.infer<typeof primitive>;

export const array = build('array')
	.arg('of', primitive)
	.value('min', z.number().min(0))
	.value('max', z.number().min(0))
	.value('length', z.number().min(0))
	.fn('nonempty')
	.toZod();
export const tuple = build('tuple').arg('contents', primitive.array()).arg('rest', primitive.optional()).toZod();
export const record = build('record').arg('key', primitive).arg('value', primitive).toZod();
export const partialRecord = build('partialRecord').arg('key', primitive).arg('value', primitive).toZod();
export const looseRecord = build('looseRecord').arg('key', primitive).arg('value', primitive).toZod();
const _object = build('object')
	.arg('shape', z.record(z.string(), primitive))
	.value('catchall', primitive)
	.fn('strict')
	.fn('loose')
	.fn('partial')
	.fn('required')
	.fn('strip');
export const object = _object.toZod();
export const strictObject = build('strictObject').arg('shape', z.record(z.string(), primitive)).with(_object).toZod();
export const looseObject = build('looseObject').arg('shape', z.record(z.string(), primitive)).with(_object).toZod();
export const templateLiteral = build('templateLiteral')
	.arg('parts', z.union([primitive, z.string()]).array())
	.toZod();

export interface composite extends z.ZodDiscriminatedUnion<
	[
		...typeof primitive.options,
		typeof array,
		typeof tuple,
		typeof record,
		typeof partialRecord,
		typeof looseRecord,
		typeof object,
		typeof strictObject,
		typeof looseObject,
		typeof templateLiteral,
		z.ZodLazy<
			z.ZodPipe<
				z.ZodObject<
					{
						options: z.ZodArray<composite>;
						optional: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodLiteral<'exact'>]>>;
						nullable: z.ZodOptional<z.ZodBoolean>;
						nullish: z.ZodOptional<z.ZodBoolean>;
						default: z.ZodOptional<z.ZodAny>;
						coerce?: z.ZodOptional<z.ZodBoolean> | undefined;
						type: z.ZodLiteral<'union'>;
					},
					z.core.$strip
				>,
				z.ZodTransform<TypeToZod<'union', false>, any>
			>
		>,
	],
	'type'
> {}

export const composite: composite = z.discriminatedUnion('type', [
	...primitive.options,
	array,
	tuple,
	record,
	partialRecord,
	looseRecord,
	object,
	strictObject,
	looseObject,
	templateLiteral,
	z.lazy(() => build('union').arg('options', composite.array()).toZod()),
]);

export type compositeInput = z.input<typeof composite>;
export interface compositeZod extends z.infer<typeof composite> {}

export const discriminatedUnion = build('discriminatedUnion').arg('discriminator', z.string()).arg('options', composite.array()).toZod();
export const intersection = build('intersection').arg('left', composite).arg('right', composite).toZod();
export const xor = build('xor').arg('options', composite.array()).toZod();

export const schema: z.ZodDiscriminatedUnion<
	[...typeof composite.options, typeof discriminatedUnion, typeof intersection, typeof xor],
	'type'
> = z.discriminatedUnion('type', [...composite.options, discriminatedUnion, intersection, xor]);

export type input = z.input<typeof schema>;
export type schema = z.infer<typeof schema>;
