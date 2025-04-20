export interface Plugin {
	id: string;
	name: string;
	version: string;

	statusText?(): Promise<string>;

	db?: {
		init(): Promise<void>;
		/** Removes plugin-related database tables, schemas, etc. */
		drop(): Promise<void>;
		/** Empties plugin-related data from the database */
		wipe(): Promise<void>;
	};
}
