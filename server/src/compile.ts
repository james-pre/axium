import { Option, program } from 'commander';
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path/posix';
import { compile } from 'svelte/compiler';
import config from './config.js';
import { exit, info, warn } from './io.js';

const svelteImport = /^(import \w+ from '.*)\.svelte';$/gim;

interface CompileOptions {
	target: 'server' | 'client';
}

export function compileSvelte(filename: string, options: CompileOptions) {
	const source = readFileSync(filename, 'utf-8');

	const { js, warnings } = compile(source, {
		filename,
		runes: true,
		dev: config.debug,
		generate: options.target,
		experimental: { async: true },
		modernAst: true,
	});

	for (const warning of warnings) {
		let location = (warning.filename || filename) + ':';
		if (warning.position) location += `${warning.position[0]}:${warning.position[1]}:`;
		else if (warning.start) location += `${warning.start.line}:${warning.start.column}:`;
		warn(warning.message);
		warn(location);
		if (warning.start && warning.end) {
			const snippet = source.slice(warning.start.character, warning.end.character).trim();
			const lines = snippet.split('\n');
			info('\t' + (lines.length > 1 ? lines[0] + '\n\t...' : lines[0]));
		}
	}

	return js.code.replaceAll(svelteImport, "$1.js';");
}

program
	.command('compile')
	.description('Compile Svelte files to JavaScript [experimental]')
	.argument('<inputs...>', 'Path to the inputs to compile')
	.option('-o, --output <path>', 'Output path for the compiled code')
	.option('-O, --output-dir <path>', 'Output directory for the compiled code')
	.option('-b, --base-dir <path>', 'Base directory for the inputs', process.cwd())
	.addOption(
		new Option('-t, --target <target>', 'Target environment for the compiled code').choices(['server', 'client']).default('server')
	)
	.action((inputs: string[], opt: CompileOptions & { output: string; outputDir: string; baseDir: string }) => {
		const files = globSync(inputs);
		if (!files.length) exit('No inputs provided.');
		if (files.length == 1) {
			if (opt.output) mkdirSync(dirname(opt.output), { recursive: true });
			else if (opt.outputDir) opt.output = join(opt.outputDir, basename(files[0]).replace(/\.svelte$/, '.js'));

			const code = compileSvelte(files[0], opt);
			writeFileSync(opt.output, code);
			return;
		}

		if (opt.outputDir) mkdirSync(opt.outputDir, { recursive: true });
		else if (!existsSync(opt.output)) exit('Output path does not exist but multiple inputs were provided.');

		for (const file of files) {
			const code = compileSvelte(file, opt);
			const outputFile = join(
				opt.outputDir || opt.output,
				relative(opt.baseDir, dirname(file)),
				basename(file).replace(/\.svelte$/, '.js')
			);
			writeFileSync(outputFile, code);
		}
	});
