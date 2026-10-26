import * as z from 'zod';

export const PushNotification = z.object({
	title: z.string().nonempty(),
	body: z.string().optional(),
	/** Opened when the notification is clicked */
	url: z.string().optional(),
	/** Notifications with the same tag replace each other */
	tag: z.string().optional(),
	icon: z.string().optional(),
});
export interface PushNotification extends z.infer<typeof PushNotification> {}

/** The JSON form of a browser `PushSubscription` */
export const PushSubscriptionInit = z.object({
	endpoint: z.httpUrl(),
	expirationTime: z.number().nullish(),
	keys: z.object({ p256dh: z.base64url(), auth: z.base64url() }),
});
export interface PushSubscriptionInit extends z.infer<typeof PushSubscriptionInit> {}
