import { addListener } from '@axium/client/socket';
import '../common.js';
import { systemInfo } from './info.js';
import * as os from 'node:os';

addListener('sysadmin:ping', cb =>
	cb({
		hostname: os.hostname(),
		username: os.userInfo().username,
	})
);
addListener('sysadmin:getSystemInfo', cb => cb(systemInfo()));
