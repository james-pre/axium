const byteSizePattern = /^(?<size>\d+(?:\.\d+)?)\s*(?<unit>\w*)$/i;
const units = ['', 'K', 'M', 'G', 'T', 'P', 'E'];

export function parseByteSize(input: string): number | null {
	const match = byteSizePattern.exec(input.trim());
	if (!match) return null;
	const size = parseFloat(match.groups!.size);
	if (!Number.isFinite(size)) return null;
	let unit = match.groups!.unit.toUpperCase();
	if (unit.at(-1) == 'B') unit = unit.slice(0, -1);
	if (unit.at(-1) == 'I') unit = unit.slice(0, -1);
	const unitIndex = units.indexOf(unit);
	if (unitIndex === -1) return null;
	return Math.round(size * Math.pow(1024, unitIndex));
}
