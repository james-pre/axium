import { text } from '@axium/client';
import { addListener, connect } from '@axium/client/socket';
import { toast } from '@axium/client/toast';
import '../common.js';

await connect().catch(() => null);

addListener('email.received', email => {
	if (email.folder != 'spam') void toast('info', text('email.toast_received', { name: email.from.name || email.from.address }));
});
