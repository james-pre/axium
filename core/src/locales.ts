import { registry as zodRegistry } from 'zod/v4/core';

/**
 * Zod registry for attaching translation keys to schemas
 */
export const zKeys = zodRegistry<{ key: string }>();
