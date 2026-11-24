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

const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });

/** Ends of text where a sentence continues, e.g. "Dr. Smith" and "U.S. Army" */
const abbreviation = /(?:\b\p{Lu}|\b(?:Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|Mt|vs))\.\s*$/u;

/** Splits text into sentences, keeping any whitespace after each */
function sentences(text: string): string[] {
	const result: string[] = [];
	for (const { segment } of segmenter.segment(text)) {
		if (result.length && abbreviation.test(result.at(-1)!)) result[result.length - 1] += segment;
		else result.push(segment);
	}
	return result;
}

/** Splits a sentence that is too long to speak at once, at clause boundaries where possible */
function splitSentence(sentence: string): string[] {
	const parts: string[] = [];
	let rest = sentence;
	while (rest.length > maxPartLength) {
		const window = rest.slice(0, maxPartLength);
		const clause = Math.max(...Array.from(window.matchAll(/[,;:–—]\s/g), match => match.index + 1));
		const end = clause > maxPartLength / 3 ? clause : window.lastIndexOf(' ') > 0 ? window.lastIndexOf(' ') : maxPartLength;
		parts.push(rest.slice(0, end).trim());
		rest = rest.slice(end).trimStart();
	}
	parts.push(rest.trim());
	return parts;
}

/** Splits text into sentences to speak one after another, splitting any that are too long */
export function speechParts(text: string): string[] {
	return sentences(text)
		.flatMap(splitSentence)
		.filter(part => /[\p{L}\p{N}]/u.test(part));
}

/**
 * Collects Markdown as it streams and gives the parts that are ready to be spoken:
 * whole sentences, never the inside of a code block.
 */
export class SpeechBuffer {
	protected text = '';

	/** Adds streamed text, returning the parts it completed */
	push(text: string): string[] {
		this.text += text;

		const fences = this.text.match(/```/g)?.length ?? 0;
		const inCode = fences % 2 == 1;
		const searchable = inCode ? this.text.slice(0, this.text.lastIndexOf('```')) : this.text;

		// The last sentence may still be streaming, unless a code block has started after it.
		const end = inCode ? searchable.length : searchable.length - (sentences(searchable).at(-1)?.length ?? 0);
		if (end <= 0) return [];

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
