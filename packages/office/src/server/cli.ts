import { program } from 'commander';
import * as io from 'ioium/node';
import { buildImage, defaultBase, detectEngine } from './image.js';

const cli = program.command('office').helpGroup('Plugins:').description('CLI integration for @axium/office');

interface PatchImageOptions {
	engine?: string;
	tag: string;
	context?: string;
}

cli.command('patch-image')
	.description("Build the document server image: Euro-Office patched for Axium, with Axium's themes")
	.argument('[base]', 'the Euro-Office image to patch', defaultBase)
	.option('--engine <engine>', 'the container engine, docker or podman (default: whichever is installed)')
	.option('--tag <tag>', 'the tag of the built image', 'axium-documentserver')
	.option('--context <directory>', 'keep the build context in this directory, which is replaced (default: a temporary directory)')
	.action((base: string, options: PatchImageOptions) => {
		const engine = options.engine ?? detectEngine();
		io.track(`Building ${options.tag} from ${base} with ${engine}`, () =>
			buildImage({ base, engine, tag: options.tag, context: options.context })
		);
	});
