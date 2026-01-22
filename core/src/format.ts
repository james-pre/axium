export function formatDateRange(date: Date): string {
	const rawDays = (date.getTime() - Date.now()) / (24 * 3600_000);
	const daysCount = Math.abs(rawDays);
	const daysText = Math.round(daysCount);

	const plural = daysCount == 1 ? '' : 's';

	return `${date.toLocaleString()} (${rawDays >= 0 ? `in ${daysText} day${plural}` : `${daysText} day${plural} ago`})`;
}

export function formatBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];

	const i = bytes == 0 ? 0 : Math.floor(Math.log10(bytes) / 3);

	const value = bytes == 0 ? 0 : bytes / Math.pow(1000, i);

	return `${Number.isInteger(value) ? value : value.toFixed(2)} ${units[i]}`;
}

export default {
	dateRange: formatDateRange,
	bytes: formatBytes,
};
