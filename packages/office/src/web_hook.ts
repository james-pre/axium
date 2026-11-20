import { openers } from '@axium/storage/client/3rd-party';
import { formats } from './common.js';

openers.push({
	name: 'Office',
	types: formats.map(format => format.type),
	openURL: item => `/office/${item.id}`,
});
