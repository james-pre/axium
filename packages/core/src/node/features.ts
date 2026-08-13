import { Argument, type Command } from 'commander';
import { assertYes } from 'ioium/node';
import { styleText } from 'node:util';
import { _featureBuiltinFrom, FeatureId, getFeature, getFeatures, setFeature, type Feature } from '../features.js';

export interface FormatFeatureOptions {
	/** @default 0 */
	indent?: number;
	/** @default false */
	includeFrom?: boolean;
}

export function formatFeatures(features: Iterable<Feature>, options: FormatFeatureOptions = {}) {
	const { indent = 0, includeFrom = false } = options;

	const value = Array.from(features);

	for (const feature of value)
		console.log(
			...[
				' '.repeat((indent || 1) - 1),
				feature.id,
				feature.experimental && styleText('cyan', '[experimental]'),
				includeFrom && styleText('gray', feature.from == _featureBuiltinFrom ? '(builtin)' : `(from ${feature.from})`),
				':',
				feature.value ? styleText('green', 'enabled') : styleText('red', 'disabled'),
				feature.default === feature.value && styleText('dim', '(default)'),
			].filter(v => !!v)
		);
}

const FeatureIdArg = new Argument('<id>', 'The ID of the feature to enable').argParser(value => FeatureId.parse(value));

export function createFeatureCommand<C extends Command>(parent: C) {
	const cmd = parent.command('feature').description('Manage features');

	cmd.command('list')
		.description('List features')
		.option('-F, --from <from>', 'Filter by source plugin')
		.action(opt => {
			const features = getFeatures();

			formatFeatures(
				opt.from
					? features.filter(f => (['none', 'builtin'].includes(opt.from!) ? _featureBuiltinFrom : opt.from) === f.from)
					: features,
				{ includeFrom: true }
			);
		});

	cmd.command('enable')
		.description('Enable a feature')
		.addArgument(FeatureIdArg)
		.action(id => setFeature(id, true));

	cmd.command('disable')
		.description('Disable a feature')
		.addArgument(FeatureIdArg)
		.action(id => setFeature(id, false));

	cmd.command('reset')
		.description('Reset a feature to its default value')
		.addArgument(FeatureIdArg)
		.action(id => {
			const feature = getFeature(id);
			if (!feature) throw new ReferenceError('Feature is not defined: ' + id);
			setFeature(id, feature.default);
		});

	cmd.command('reset-all')
		.description('Reset all features to their default values')
		.option('-f, --force', 'Do not ask for confirmation')
		.action(async ({ force }) => {
			if (!force) await assertYes('Reset all features to their default values?');
			for (const feature of getFeatures()) setFeature(feature.id, feature.default, true);
		});

	return cmd;
}
