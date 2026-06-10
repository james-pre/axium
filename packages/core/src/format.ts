export function formatDateRange(date: Date): string {
	const rawDays = (date.getTime() - Date.now()) / (24 * 3600_000);
	const daysCount = Math.abs(rawDays);
	const daysText = Math.round(daysCount);

	const plural = daysCount == 1 ? '' : 's';

	return `${date.toLocaleString()} (${rawDays >= 0 ? `in ${daysText} day${plural}` : `${daysText} day${plural} ago`})`;
}

export function formatBytes(bytes: bigint): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];

	const i = bytes == 0n ? 0 : Math.floor((bytes.toString(10).length - 1) / 3);
	const value = bytes == 0n ? 0 : Number(bytes) / Math.pow(1000, i);

	return `${Number.isInteger(value) ? value : value.toFixed(2)} ${units[i]}`;
}

export function formatMs(time: number): string {
	return time > 5000 ? (time / 1000).toFixed(2) + 's' : time + 'ms';
}

/** Formats a short duration into colon-separated values */
export function formatDuration(seconds: number): string {
	seconds = Math.floor(seconds);
	let minutes = Math.floor(seconds / 60);
	seconds %= 60;
	const hours = Math.floor(minutes / 60);
	minutes %= 60;
	const secondsStr = ':' + seconds.toString().padStart(2, '0');
	return hours ? `${hours}:${minutes.toString().padStart(2, '0')}${secondsStr}` : minutes + secondsStr;
}

export default {
	dateRange: formatDateRange,
	bytes: formatBytes,
	ms: formatMs,
	duration: formatDuration,
};
