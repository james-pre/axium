import { Argument, type Command } from 'commander';
import { assertYes, readJSON, writeJSON } from 'ioium/node';
import { styleText } from 'node:util';
import * as features from '../features.js';

export interface FormatFeatureOptions {
	/** @default 0 */
	indent?: number;
	/** @default false */
	includeFrom?: boolean;
}

export function formatFeatures(info: Iterable<features.Feature>, options: FormatFeatureOptions = {}) {
	const { indent = 0, includeFrom = false } = options;

	const value = Array.from(info);

	for (const feature of value)
		console.log(
			...[
				' '.repeat((indent || 1) - 1),
				feature.id,
				feature.experimental && styleText('cyan', '[experimental]'),
				includeFrom && styleText('gray', feature.from == features._builtinFrom ? '(builtin)' : `(from ${feature.from})`),
				':',
				feature.value ? styleText('green', 'enabled') : styleText('red', 'disabled'),
				feature.default === feature.value && styleText('dim', '(default)'),
			].filter(v => !!v)
		);
}

export function persistFeaturesTo(path: string) {
	let existing = {};

	try {
		existing = readJSON(path, features.Values);
	} catch {
		// couldn't read
	}

	features.persist(existing, f => writeJSON(path, f));
}

const FeatureIdArg = new Argument('<id>', 'The ID of the feature to enable').argParser(value => features.Id.parse(value));

export function createFeatureCommand<C extends Command>(parent: C) {
	const cmd = parent.command('feature').description('Manage features');

	cmd.command('list')
		.description('List features')
		.option('-F, --from <from>', 'Filter by source plugin')
		.action(opt => {
			const configs = features.getAll();

			formatFeatures(
				opt.from
					? configs.filter(f => (['none', 'builtin'].includes(opt.from!) ? features._builtinFrom : opt.from) === f.from)
					: configs,
				{ includeFrom: true }
			);
		});

	cmd.command('enable')
		.description('Enable a feature')
		.addArgument(FeatureIdArg)
		.action(id => features.set(id, true));

	cmd.command('disable')
		.description('Disable a feature')
		.addArgument(FeatureIdArg)
		.action(id => features.set(id, false));

	cmd.command('reset')
		.description('Reset a feature to its default value')
		.addArgument(FeatureIdArg)
		.action(id => {
			const feature = features.get(id);
			if (!feature) throw new ReferenceError('Feature is not defined: ' + id);
			features.reset(id);
		});

	cmd.command('reset-all')
		.description('Reset all features to their default values')
		.option('-f, --force', 'Do not ask for confirmation')
		.action(async ({ force }) => {
			if (!force) await assertYes('Reset all features to their default values?');
			features.resetAll();
		});

	return cmd;
}
