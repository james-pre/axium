import { socket } from '@axium/client/socket';

export async function getOnlineHosts() {
	if (!socket) return [];

	try {
		const systems = await socket.emitWithAck('sysadmin:ping');
		return systems.map(s => s.hostname);
	} catch {
		return [];
	}
}
