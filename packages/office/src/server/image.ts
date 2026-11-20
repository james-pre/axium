import { execFileSync, spawnSync } from 'node:child_process';
import {
	chmodSync,
	cpSync,
	globSync,
	mkdirSync,
	mkdtempDisposableSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import patches from './patches.json' with { type: 'json' };
import { editorThemes } from './themes.js';

export const defaultBase = 'ghcr.io/euro-office/documentserver:v9.3.8';

/** The source of the base themes' tokens */
const stylesheet = 'documenteditor/main/app.css';

const engines = ['docker', 'podman'];

/** The first container engine that is installed */
export function detectEngine(): string {
	const engine = engines.find(engine => spawnSync(engine, ['--version'], { stdio: 'ignore' }).status === 0);
	if (!engine) throw new Error(`Neither ${engines.join(' nor ')} is installed`);
	return engine;
}

export interface ImageOptions {
	/** The Euro-Office image to patch */
	base: string;
	engine: string;
	/** The directory that receives the build context, which is replaced */
	context: string;
}

function container(engine: string, ...args: string[]): Buffer {
	return execFileSync(engine, args, { maxBuffer: 2 ** 30 });
}

/** The environment variables an image sets */
function imageEnvironment(engine: string, image: string): Record<string, string> {
	const entries: string[] = JSON.parse(container(engine, 'image', 'inspect', '--format', '{{json .Config.Env}}', image).toString());
	return Object.fromEntries(entries.map(entry => entry.split(/=(.*)/s, 2)));
}

/** The tokens of a built-in theme's rule in an editor stylesheet */
function baseColors(css: string, themeId: string): Record<string, string> {
	const rule = new RegExp(`:root \\.${themeId}\\s*\\{([^}]*)\\}`).exec(css);
	if (!rule) throw new Error(`No rule for ${themeId} in ${stylesheet}`);

	const declarations = rule[1].split(';').filter(declaration => declaration.includes(':'));
	return Object.fromEntries(
		declarations.map(declaration => {
			const [name, value] = declaration.split(/:(.*)/s, 2);
			return [name.trim().replace(/^--/, ''), value.trim()];
		})
	);
}

/** Applies every patch to the files in `extracted`, failing unless each file holds the anchor exactly `count` times */
function applyPatches(extracted: string): Map<string, string> {
	const patched = new Map<string, string>();

	for (const { group, count, anchor, replacement } of patches.patches) {
		for (const file of globSync(patches.groups[group], { cwd: extracted })) {
			const content = patched.get(file) ?? readFileSync(join(extracted, file), 'utf8');
			const found = content.split(anchor).length - 1;
			if (found != count) throw new Error(`Expected ${count} of ${JSON.stringify(anchor)} in ${file}, found ${found}`);
			patched.set(file, content.replaceAll(anchor, replacement));
		}
	}

	return patched;
}

/** Writes the build context of Axium's document server image: the base image's files patched for Axium, plus Axium's themes */
export function writeContext({ base, engine, context }: ImageOptions): void {
	using extracted = mkdtempDisposableSync(join(tmpdir(), 'axium-documentserver-base-'));

	const patterns = [...new Set(Object.values(patches.groups).flat())];
	const archive = container(
		engine,
		'run',
		'--rm',
		'--entrypoint',
		'sh',
		base,
		'-c',
		`cd "\${EO_ROOT:?${base} is not a Euro-Office image}/web-apps/apps" && tar -c ${patterns.join(' ')}`
	);
	execFileSync('tar', ['-x', '-C', extracted.path], { input: archive });

	const { EO_ROOT: root, EO_CONF: configDirectory } = imageEnvironment(engine, base);
	if (!root || !configDirectory) throw new Error(`${base} is not a Euro-Office image: it does not set EO_ROOT and EO_CONF`);

	rmSync(context, { recursive: true, force: true });
	const apps = join(context, 'web-apps/apps');

	for (const [file, content] of applyPatches(extracted.path)) {
		const destination = join(apps, file);
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, content);
		writeFileSync(destination + '.gz', gzipSync(content));
		writeFileSync(destination + '.br', brotliCompressSync(content));
		for (const path of [destination, destination + '.gz', destination + '.br'])
			chmodSync(path, statSync(join(extracted.path, file)).mode);
	}

	const css = readFileSync(join(extracted.path, stylesheet), 'utf8');
	const themes = join(apps, 'common/main/resources/themes');
	mkdirSync(themes, { recursive: true });

	for (const { base: themeBase, ...theme } of editorThemes()) {
		const complete = { ...theme, colors: { ...baseColors(css, themeBase), ...theme.colors } };
		writeFileSync(join(themes, theme.id.replace(/^theme-/, '') + '.json'), JSON.stringify(complete, null, '\t') + '\n');
	}

	cpSync(join(import.meta.dirname, '../../assets/documentserver.json'), join(context, 'local-production-linux.json'));

	writeFileSync(
		join(context, 'Containerfile'),
		`FROM ${base}
COPY --chown=ds:ds web-apps ${root}/web-apps
COPY --chown=ds:ds local-production-linux.json ${configDirectory}/
RUN find ${root}/web-apps -type d -exec chmod 555 {} + && documentserver-flush-cache.sh -r false
`
	);
}

/** Writes the build context to `context`, or a temporary directory that is removed afterwards, and builds the image as `tag` */
export function buildImage(options: Omit<ImageOptions, 'context'> & { context?: string; tag: string }): void {
	const context = options.context ?? mkdtempSync(join(tmpdir(), 'axium-documentserver-'));
	try {
		writeContext({ ...options, context });
		execFileSync(options.engine, ['build', '--file', join(context, 'Containerfile'), '--tag', options.tag, context], {
			stdio: 'inherit',
		});
	} finally {
		if (!options.context) rmSync(context, { recursive: true, force: true });
	}
}
