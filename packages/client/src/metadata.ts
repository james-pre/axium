import type { InstanceMetadata } from '@axium/core';
import { fetchAPI } from './requests.js';

let _metadata: InstanceMetadata;

export async function instanceMetadata(): Promise<InstanceMetadata> {
	_metadata ||= await fetchAPI('GET', 'metadata');
	return _metadata;
}
