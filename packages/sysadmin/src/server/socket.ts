import { addListener, io } from '@axium/server/socket';

addListener('sysadmin:ping', async (socket, cb) => {
	const result = await io.in(`local:${socket.data.user.id}`).timeout(5000).emitWithAck('sysadmin:ping');
	cb(result);
});

addListener('sysadmin:getSystemInfo', async (socket, cb) => {
	const result = await io.in(`local:${socket.data.user.id}`).timeout(5000).emitWithAck('sysadmin:getSystemInfo');
	cb(result);
});
