/** Markdown as it should be read aloud: no code blocks, markup or link targets */
export function speakable(markdown: string): string {
	return markdown
		.replace(/```[\s\S]*?(?:```|$)/g, ' ')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/<[^>]+>/g, ' ')
		.replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
		.replace(/^[ \t]*\|?[ \t:|-]+\|[ \t:|-]*$/gm, '')
		.replace(/^[ \t]*\|[ \t]*|[ \t]*\|[ \t]*$/gm, '')
		.replace(/[ \t]*\|[ \t]*/g, ', ')
		.replace(/[*_~`]+/g, '')
		.replace(/[ \t]+/g, ' ')
		.replace(/([^\s.!?:;,])[ \t]*\n+/g, '$1.\n')
		.replace(/\s*\n\s*/g, '\n')
		.trim();
}

/** The most characters spoken in one request, which keeps each part well within what the model generates at once */
export const maxPartLength = 300;

/** Splits text into parts to speak one after another, at sentence and line boundaries where possible */
export function speechParts(text: string): string[] {
	const sentences = text.match(/[^.!?\n]+(?:[.!?]+["')\]]*|\n+|$)\s*/g) ?? [];
	const parts: string[] = [];
	let current = '';

	for (const sentence of sentences) {
		if (current && current.length + sentence.length > maxPartLength) {
			parts.push(current.trim());
			current = '';
		}

		let rest = sentence;
		while (rest.length > maxPartLength) {
			const space = rest.lastIndexOf(' ', maxPartLength);
			const end = space > 0 ? space : maxPartLength;
			parts.push(rest.slice(0, end).trim());
			rest = rest.slice(end).trimStart();
		}
		current += rest;
	}

	if (current.trim()) parts.push(current.trim());
	return parts.filter(part => /[\p{L}\p{N}]/u.test(part));
}

/**
 * Collects Markdown as it streams and gives the parts that are ready to be spoken:
 * whole sentences and lines, never the inside of a code block.
 */
export class SpeechBuffer {
	protected text = '';

	/** Adds streamed text, returning the parts it completed */
	push(text: string): string[] {
		this.text += text;

		const fences = this.text.match(/```/g)?.length ?? 0;
		const searchable = fences % 2 ? this.text.slice(0, this.text.lastIndexOf('```')) : this.text;

		let end = -1;
		for (const match of searchable.matchAll(/[.!?]["')\]]*\s|\n/g)) end = match.index + match[0].length;
		if (end == -1) return [];

		const ready = this.text.slice(0, end);
		this.text = this.text.slice(end);
		return speechParts(speakable(ready));
	}

	/** Returns whatever is left, once the text is complete */
	end(): string[] {
		const rest = this.text;
		this.text = '';
		return speechParts(speakable(rest));
	}
}
