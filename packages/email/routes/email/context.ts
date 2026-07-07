import type { Composer } from '@axium/email/components';

/** Shared by the email layout with its pages */
export interface EmailApp {
	/** The layout's Composer instance */
	composer(): ReturnType<typeof Composer> | undefined;
	toggleSidebar(): void;
}

export const emailApp = Symbol('email-app');
