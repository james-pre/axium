/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
import { _findPlugin, getConfig, type PluginConfig, type PluginInternal } from '@axium/core';
import { error } from 'ioium';
import * as z from 'zod';
import { events, type AuditEventConfigInit } from './audit.js';
import { addRoute, type RouteInit, type RouteParams } from './routes.js';

export interface ServerPlugin<Name extends string> extends PluginInternal {}

export class ServerPlugin<Name extends string> {
	constructor(
		protected readonly _id: Name,
		data: PluginInternal
	) {
		Object.assign(this, data);
	}

	addRoute<const P extends RouteParams = RouteParams>(init: RouteInit<P>): void {
		addRoute({
			...init,
			plugin: this._id,
		});
	}

	addEvent(init: Omit<AuditEventConfigInit, 'source'>): void {
		if (events.has(init.name)) throw error(`Can not register multiple events with the same name ("${init.name}")`);
		const config = {
			...init,
			source: this._id,
			extra: init.extra ? z.object(init.extra) : undefined,
		};
		events.set(init.name, config);
	}

	getConfig(): PluginConfig<Name> {
		return getConfig(this._id);
	}
}

export function bindPlugin<Name extends string>(name: Name): ServerPlugin<Name> {
	const plugin = _findPlugin(name);
	return new ServerPlugin(name, plugin);
}
