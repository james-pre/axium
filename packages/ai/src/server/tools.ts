import type { UserInternal } from '@axium/core';
import features from '@axium/core/features';
import { isResponseError } from '@axium/server/requests';
import * as io from 'ioium';
import * as z from 'zod';
import type * as ai from '../common.js';

export interface Context {
	/** The user the tool acts for */
	user: UserInternal;
	signal: AbortSignal;
}

export interface Tool<Input extends z.ZodObject = z.ZodObject> {
	/** Unique, in `snake_case` */
	name: string;
	/** Shown to the model; formats belong in the input schema's descriptions */
	description: string;
	environment: ai.Environment;
	access: ai.ToolAccess;
	/** Whether write calls ask first, unless the user changed it. Defaults to `ask`. */
	approval?: ai.Approval;
	input: Input;
	/** Whether the tool can be offered, e.g. `false` while its configuration is missing */
	available?(): boolean;
	/** The result is given to the model as-is when it's a string, and as JSON otherwise */
	run(input: z.infer<Input>, context: Context): Promise<unknown>;
}

const registry = new Map<string, Tool>();

/** @throws if a tool with the same name exists */
export function add<const Input extends z.ZodObject>(tool: Tool<Input>): void {
	if (registry.has(tool.name)) throw new ReferenceError(`Tool "${tool.name}" already exists`);
	registry.set(tool.name, tool);
}

/** The tools allowed by the user's preferences and the server's features */
export function allowed(preferences: ai.Preferences['tools'], anonymous: boolean = false): Tool[] {
	return Array.from(registry.values()).filter(tool => {
		if (tool.available && !tool.available()) return false;

		switch (tool.environment) {
			case 'web':
				return preferences.web && features('ai-web-tools');
			case 'account':
				if (anonymous || !features('ai-account-access')) return false;
				return preferences.account_access == 'write' || (preferences.account_access == 'read' && tool.access == 'read');
		}
	});
}

/**
 * Whether a call must wait for the user's approval.
 * @param allowed Tools the user allowed for the rest of the conversation
 */
export function needsApproval(tool: Tool | undefined, preferences: ai.Preferences['tools'], allowed: ReadonlySet<string>): boolean {
	if (tool?.access != 'write' || !preferences.confirm_writes || allowed.has(tool.name)) return false;
	return (preferences.approvals[tool.name] ?? tool.approval ?? 'ask') == 'ask';
}

/** Tools in the OpenAI chat completions format */
export function definitions(offered: Tool[]) {
	return offered.map(tool => ({
		type: 'function' as const,
		function: { name: tool.name, description: tool.description, parameters: z.toJSONSchema(tool.input) },
	}));
}

/** Characters of a result given to the model */
const maxResultLength = 32_000;

export interface CallResult {
	status: 'done' | 'error';
	/** What the model sees */
	content: string;
	/** What the user sees */
	error: string | null;
}

function failure(error: string): CallResult {
	return { status: 'error', content: 'Error: ' + error, error };
}

/** Validates a call's arguments and runs it. Never throws: failures are described for the model. */
export async function run(tool: Tool | undefined, call: ai.ToolCall, context: Context): Promise<CallResult> {
	if (!tool) return failure(`The tool "${call.name}" is not available`);

	let input: unknown;
	try {
		input = JSON.parse(call.arguments || '{}');
	} catch {
		return failure('The arguments are not valid JSON');
	}

	const parsed = tool.input.safeParse(input);
	if (!parsed.success) return failure('Invalid arguments:\n' + z.prettifyError(parsed.error));

	try {
		const result = await tool.run(parsed.data, context);
		const text = typeof result == 'string' ? result : JSON.stringify(result);
		if (text.length <= maxResultLength) return { status: 'done', content: text, error: null };

		if (typeof result != 'string') return failure(`The result is too large (${text.length} characters); ask for less`);

		return {
			status: 'done',
			content: text.slice(0, maxResultLength) + `\n[Truncated: showing ${maxResultLength} of ${text.length} characters]`,
			error: null,
		};
	} catch (error) {
		if (!isResponseError(error)) io.debug('AI: tool', tool.name, 'failed:', io.errorText(error));
		return failure(isResponseError(error) ? error.message : io.errorText(error));
	}
}

export function get(name: string): Tool | undefined {
	return registry.get(name);
}
