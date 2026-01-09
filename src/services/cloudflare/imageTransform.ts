export function buildCloudflareImageTransformUrl(inputUrl: string, options: {
	saturation?: number;
	width?: number;
	height?: number;
	fit?: 'pad' | 'cover' | 'contain' | 'scale-down';
	background?: string; // e.g. 'white' or '%23ffffff'
	format?: 'jpeg' | 'png' | 'webp' | 'avif';
}): string {
	const parts: string[] = [];
	if (typeof options.saturation === 'number') parts.push(`saturation=${options.saturation}`);
	if (typeof options.width === 'number') parts.push(`width=${options.width}`);
	if (typeof options.height === 'number') parts.push(`height=${options.height}`);
	if (options.fit) parts.push(`fit=${options.fit}`);
	if (options.background) parts.push(`background=${options.background}`);
	if (options.format) parts.push(`format=${options.format}`);

	const params = parts.join(',');
	return `https://api.beuken.ai/cdn-cgi/image/${params}/${inputUrl}`;
}


