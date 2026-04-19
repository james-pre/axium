import type { CapacitorConfig } from '@capacitor/cli';

export default {
	appId: 'axium.tasks',
	appName: 'Axium Tasks',
	webDir: 'build/native',
	server: {
		androidScheme: 'https',
		// @todo generate this dynamically
		allowNavigation: ['jrig.local'],
	},
	plugins: {
		CapacitorHttp: {
			enabled: true,
		},
	},
} satisfies CapacitorConfig;
