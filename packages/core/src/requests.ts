export const requestMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'] as const;

export type RequestMethod = (typeof requestMethods)[number];
