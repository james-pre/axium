import { isTag, isText, type AnyNode, type Element } from 'domhandler';
import { DomUtils, parseDocument } from 'htmlparser2';

/** Elements whose content is never part of a page's text */
const ignored = new Set([
	'script',
	'style',
	'noscript',
	'template',
	'svg',
	'canvas',
	'iframe',
	'object',
	'embed',
	'head',
	'nav',
	'aside',
	'footer',
	'form',
	'button',
	'input',
	'select',
	'textarea',
	'dialog',
]);

/** Roles of landmarks that surround a page's content */
const ignoredRoles = new Set(['navigation', 'banner', 'contentinfo', 'complementary', 'search']);

const blockTags = new Set([
	'address',
	'article',
	'blockquote',
	'caption',
	'dd',
	'details',
	'div',
	'dl',
	'dt',
	'fieldset',
	'figcaption',
	'figure',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hr',
	'li',
	'main',
	'ol',
	'p',
	'pre',
	'section',
	'summary',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'ul',
]);

function isIgnored(node: AnyNode): boolean {
	if (isText(node)) return false;
	if (!isTag(node)) return true;
	const { attribs } = node;
	return (
		ignored.has(node.name) ||
		ignoredRoles.has(attribs.role) ||
		'hidden' in attribs ||
		attribs['aria-hidden'] == 'true' ||
		/(^|\s)(sr-only|visually-hidden)(\s|$)/.test(attribs.class ?? '')
	);
}

class Converter {
	constructor(protected base: URL) {}

	link(element: Element): string {
		const label = this.inline(element.children).trim();
		const href = element.attribs.href;
		if (href?.startsWith('#') && /^[#¶§🔗]?$/u.test(label)) return '';
		if (!href || href.startsWith('#')) return label;

		try {
			const target = new URL(href, this.base);
			if (target.protocol != 'http:' && target.protocol != 'https:') return label;
			return label ? `[${label}](${target.href})` : '';
		} catch {
			return label;
		}
	}

	/** Wraps the element's content in `mark`, keeping surrounding whitespace outside it */
	wrap(element: Element, mark: string): string {
		const content = this.inline(element.children);
		const trimmed = content.trim();
		if (!trimmed) return content;
		return (/^\s/.test(content) ? ' ' : '') + mark + trimmed + mark + (/\s$/.test(content) ? ' ' : '');
	}

	inline(nodes: AnyNode[]): string {
		let text = '';

		for (const node of nodes) {
			if (isIgnored(node)) continue;
			if (isText(node)) {
				text += node.data.replace(/\s+/g, ' ');
				continue;
			}

			const element = node as Element;
			switch (element.name) {
				case 'br':
					text += '\n';
					break;
				case 'a': {
					const link = this.link(element);
					if (link.startsWith('[') && /\)$/.test(text)) text += ' ';
					text += link;
					break;
				}
				case 'strong':
				case 'b':
					text += this.wrap(element, '**');
					break;
				case 'em':
				case 'i':
					text += this.wrap(element, '*');
					break;
				case 'del':
				case 's':
					text += this.wrap(element, '~~');
					break;
				case 'code':
				case 'kbd':
				case 'samp':
					text += '`' + DomUtils.textContent(element).replace(/\s+/g, ' ') + '`';
					break;
				case 'img':
					if (element.attribs.alt?.trim()) text += `[image: ${element.attribs.alt.trim()}]`;
					break;
				default:
					text += blockTags.has(element.name) ? ' ' + this.blocks([element]).join(' ') + ' ' : this.inline(element.children);
			}
		}

		return text;
	}

	/** Markdown blocks, to be separated by blank lines */
	blocks(nodes: AnyNode[]): string[] {
		const blocks: string[] = [];
		let run: AnyNode[] = [];

		const flush = () => {
			const text = this.inline(run)
				.split('\n')
				.map(line => line.trim())
				.join('\n')
				.trim();
			if (text) blocks.push(text);
			run = [];
		};

		for (const node of nodes) {
			if (isIgnored(node)) continue;
			if (!isTag(node) || !blockTags.has(node.name)) {
				run.push(node);
				continue;
			}
			flush();
			blocks.push(...this.block(node));
		}

		flush();
		return blocks;
	}

	block(element: Element): string[] {
		switch (element.name) {
			case 'h1':
			case 'h2':
			case 'h3':
			case 'h4':
			case 'h5':
			case 'h6': {
				const text = this.inline(element.children).replace(/\s+/g, ' ').trim();
				return text ? ['#'.repeat(Number(element.name[1])) + ' ' + text] : [];
			}
			case 'pre':
				return [this.code(element)];
			case 'hr':
				return ['---'];
			case 'blockquote':
				return this.blocks(element.children).map(block => block.replace(/^/gm, '> '));
			case 'ul':
			case 'ol':
				return [this.list(element)];
			case 'table':
				return [this.table(element)];
			case 'dt': {
				const text = this.inline(element.children).trim();
				return text ? [`**${text}**`] : [];
			}
			default:
				return this.blocks(element.children);
		}
	}

	/** Preformatted text, with block elements (e.g. one per line) on their own lines */
	preformatted(nodes: AnyNode[]): string {
		let text = '';
		for (const node of nodes) {
			if (isIgnored(node)) continue;
			if (isText(node)) {
				text += node.data;
				continue;
			}
			const element = node as Element;
			if (element.name == 'br') {
				text += '\n';
				continue;
			}
			if (blockTags.has(element.name) && text && !text.endsWith('\n')) text += '\n';
			text += this.preformatted(element.children);
		}
		return text;
	}

	code(element: Element): string {
		const code = this.preformatted(element.children).replace(/\n+$/, '');
		const codeElement = DomUtils.findOne(node => node.name == 'code', element.children);
		const classes = `${element.attribs.class ?? ''} ${codeElement?.attribs.class ?? ''}`;
		const language = /(?:^|\s)(?:language|lang)-([\w+-]+)/.exec(classes)?.[1] ?? element.attribs['data-language'] ?? '';

		const longest = Math.max(0, ...Array.from(code.matchAll(/`+/g), match => match[0].length));
		const fence = '`'.repeat(Math.max(3, longest + 1));
		return `${fence}${language}\n${code}\n${fence}`;
	}

	list(element: Element): string {
		const ordered = element.name == 'ol';
		let number = Number(element.attribs.start) || 1;
		const items: string[] = [];

		for (const item of element.children) {
			if (!isTag(item) || item.name != 'li' || isIgnored(item)) continue;

			const marker = ordered ? `${number++}. ` : '- ';
			const text = this.blocks(item.children).join('\n');
			if (!text) continue;

			items.push(marker + text.replace(/\n/g, '\n' + ' '.repeat(marker.length)));
		}

		return items.join('\n');
	}

	table(element: Element): string {
		const rows = DomUtils.findAll(node => node.name == 'tr', element.children).map(row =>
			row.children
				.filter((cell): cell is Element => isTag(cell) && (cell.name == 'th' || cell.name == 'td'))
				.map(cell =>
					this.blocks(cell.children)
						.join(' ')
						.replace(/\s*\n\s*/g, ' ')
						.replace(/\|/g, '\\|')
				)
		);

		const width = Math.max(0, ...rows.map(row => row.length));
		if (!width) return '';

		const line = (cells: string[]) => '| ' + Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ') + ' |';
		const [head, ...body] = rows;
		return [line(head), line(Array(width).fill('---')), ...body.map(line)].join('\n');
	}
}

export interface Article {
	title?: string;
	markdown: string;
}

/** The main content of an HTML page as Markdown, without navigation and other surrounding parts */
export function htmlToMarkdown(html: string, base: URL): Article {
	const document = parseDocument(html);

	const title = DomUtils.findOne(node => node.name == 'title', document.children);

	const articles = DomUtils.findAll(node => node.name == 'article', document.children);
	const root =
		DomUtils.findOne(node => node.name == 'main' || node.attribs.role == 'main', document.children) ??
		(articles.length == 1 ? articles[0] : undefined) ??
		DomUtils.findOne(node => node.name == 'body', document.children) ??
		document;

	const converter = new Converter(base);

	return {
		title: title ? DomUtils.textContent(title).replace(/\s+/g, ' ').trim() : undefined,
		markdown: converter.blocks(root.children).join('\n\n'),
	};
}
