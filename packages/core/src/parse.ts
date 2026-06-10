const byteSizePattern = /^(?<size>\d+(?:\.\d+)?)\s*(?<unit>\w*)$/i;
const units = ['', 'K', 'M', 'G', 'T', 'P', 'E'];

export function parseByteSize(input: string): bigint | null {
	const match = byteSizePattern.exec(input.trim());
	if (!match) return null;
	const size = BigInt(match.groups!.size);
	let unit = match.groups!.unit.toUpperCase();
	if (unit.at(-1) == 'B') unit = unit.slice(0, -1);
	if (unit.at(-1) == 'I') unit = unit.slice(0, -1);
	const unitIndex = BigInt(units.indexOf(unit));
	if (unitIndex === -1n) return null;
	return size * 1024n ** unitIndex;
}
