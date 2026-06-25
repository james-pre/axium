import { addListener } from '@axium/client/socket';
import '../common.js';
import { systemInfo } from './info.js';

addListener('sysadmin:getSystemInfo', cb => cb(systemInfo()));
