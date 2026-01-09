// Helper to robustly parse JSON that may be wrapped in Markdown code fences
export function parseJsonFromContent(content: string): any {
	if (typeof content !== 'string') return content;
	const raw = content.trim();

	// 1) Try direct JSON first
	try {
		return JSON.parse(raw);
	} catch {}

	// 2) Strip ```json ... ``` or ``` ... ```
	try {
		const withoutFences = raw
			.replace(/^```[a-zA-Z0-9_-]*\s*/i, '')
			.replace(/\s*```\s*$/i, '')
			.trim();
		return JSON.parse(withoutFences);
	} catch {}

	// 3) Extract object substring
	try {
		const startObj = raw.indexOf('{');
		const endObj = raw.lastIndexOf('}');
		if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
			return JSON.parse(raw.slice(startObj, endObj + 1));
		}
	} catch {}

	// 4) Extract array substring
	try {
		const startArr = raw.indexOf('[');
		const endArr = raw.lastIndexOf(']');
		if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
			return JSON.parse(raw.slice(startArr, endArr + 1));
		}
	} catch {}

	throw new Error('Unable to parse JSON from Groq content');
}
