import { pick } from 'utilium';

export interface CreateAppOptions {
	id: string;
	name?: string;
}

export const apps = new Map<string, App>();

export class App {
	public readonly id!: string;
	public name!: string;

	public constructor(opt: CreateAppOptions) {
		if (apps.has(opt.id)) throw new ReferenceError(`App with ID "${opt.id}" already exists.`);

		Object.assign(this, pick(opt, 'id', 'name'));

		apps.set(this.id, this);
	}
}
