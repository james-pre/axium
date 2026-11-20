import { $API, serverConfigs } from '@axium/core';
import { StorageItemMetadata } from '@axium/storage/common';
import * as locales from '@james-pre/locales';
import * as z from 'zod';

export const kinds = ['document', 'spreadsheet', 'presentation'] as const;

export const Kind = z.literal(kinds);
export type Kind = z.infer<typeof Kind>;

export interface Format {
	extension: string;
	type: string;
	kind: Kind;
}

export const formats: readonly Format[] = [
	{ extension: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document' },
	{ extension: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'spreadsheet' },
	{ extension: 'pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'presentation' },
	{ extension: 'odt', type: 'application/vnd.oasis.opendocument.text', kind: 'document' },
	{ extension: 'ods', type: 'application/vnd.oasis.opendocument.spreadsheet', kind: 'spreadsheet' },
	{ extension: 'odp', type: 'application/vnd.oasis.opendocument.presentation', kind: 'presentation' },
];

/** The format new documents of each kind are created in */
export const newFormats = {
	document: formats[0],
	spreadsheet: formats[1],
	presentation: formats[2],
} satisfies Record<Kind, Format>;

export const icons = {
	document: 'file-word',
	spreadsheet: 'file-excel',
	presentation: 'file-powerpoint',
} satisfies Record<Kind, string>;

/** Matches by MIME type first, since browsers set it on upload, then by extension */
export function formatOf(item: { name: string; type: string }): Format | undefined {
	const name = item.name.toLowerCase();
	return formats.find(format => format.type == item.type) ?? formats.find(format => name.endsWith('.' + format.extension));
}

export const Config = z
	.object({
		/** Where browsers reach the document server */
		server_url: z.url().nullish(),
		/** Where the document server reaches Axium */
		internal_url: z.url().nullish(),
		/** The document server's JWT secret */
		secret: z.string().register(locales.zod, { secret: true }),
	})
	.register(locales.zod, { prefix: 'office.config' });
export interface Config extends z.infer<typeof Config> {}

declare module '@axium/core/plugins' {
	export interface $PluginConfigs {
		'@axium/office': Config;
	}
}

serverConfigs.set('@axium/office', Config);

export const EditorOptions = z.object({
	mobile: z.boolean(),
});
export interface EditorOptions extends z.infer<typeof EditorOptions> {}

export const Editor = z.object({
	/** The document server */
	url: z.url(),
	/** The signed `DocsAPI.DocEditor` configuration */
	config: z.record(z.string(), z.unknown()),
});
export interface Editor extends z.infer<typeof Editor> {}

export const EditorSession = z.object({
	item: StorageItemMetadata,
	readOnly: z.boolean(),
	canRename: z.boolean(),
	editor: Editor,
});
export interface EditorSession extends z.infer<typeof EditorSession> {}

export const NewDocument = z.object({
	kind: Kind,
	/** Without the extension, which is added */
	name: z.string().trim().nonempty().max(250),
	parentId: z.uuid().nullish(),
});
export interface NewDocument extends z.infer<typeof NewDocument> {}

const OfficeAPI = {
	office: {
		PUT: [NewDocument, StorageItemMetadata],
	},
	'office/:id': {
		GET: [EditorOptions, EditorSession],
	},
} as const;

type OfficeAPI = typeof OfficeAPI;

declare module '@axium/core/api' {
	export interface $API extends OfficeAPI {}
}

Object.assign($API, OfficeAPI);
