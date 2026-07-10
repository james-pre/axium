import { addListener, io } from '@axium/server/socket';

addListener('sysadmin:ping', async (socket, cb) => {
	cb(
		await io
			.in(`local:${socket.data.user.id}`)
			.timeout(5000)
			.emitWithAck('sysadmin:ping')
			.catch(e => e.responses || [])
	);
});

addListener('sysadmin:getSystemInfo', async (socket, cb) => {
	cb(
		await io
			.in(`local:${socket.data.user.id}`)
			.timeout(5000)
			.emitWithAck('sysadmin:getSystemInfo')
			.catch(e => e.responses || [])
	);
});
