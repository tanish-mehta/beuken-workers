import { parseJsonFromContent } from '../../utils/json';

// OpenAI Vision: generate productName, story, and a tailored Fal prompt
export async function generateGroqVisionPrompt(
	imageBase64: string,
	env: Env
): Promise<{ productName: string; story: string; prompt: string }> {
	const startTime = Date.now();
	console.log('🎯 Generating product name, story, and prompt with OpenAI Vision...');

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

	try {
		// Model is intentionally hardcoded; configuration requires only OPENAI_API_KEY.
		const model = 'gpt-4o-mini';
		const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.OPENAI_API_KEY}`,
				'Content-Type': 'application/json',
			},
			signal: controller.signal,
			body: JSON.stringify({
				model,
				messages: [
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: `Analyze the input image and return ONLY a valid JSON object with keys productName, story, and prompt. Do not include markdown, code fences, or explanations.

For productName and story:
- productName: Short, catchy (max 3 words) for a jewelry charm derived from this image.
- story: 2–3 sentences describing a compelling jewelry product description that highlights beauty, craftsmanship, and appeal of the charm created from this image.

For prompt (strict format):
- Give a basic, short description of what needs to be converted into the charm using only nouns and count (e.g., "a dog", "two men", "a car", "a couple"). Do NOT include any colors, materials, sizes, or adjectives.
- Then produce the prompt exactly in this format using that description:
  Convert this image of <basic short description> into a 3D figurine gold charm. Image style- product photography. product centered on a white background. keep a small loop at the top. output should look like a finished jewelry charm, therefore ensure it is a one piece casting, don't keep sharp edges as well. there should be no color used apart from gold.


Return JSON format only:
{
  "productName": "Short, catchy (max 3 words)",
  "story": "2–3 sentences product description",
  "prompt": "Convert this image of <basic short description, e.g. a dog, two people, a car> into a 3D figurine gold charm. Image style- product photography. product centered on a white background. keep a small loop at the top. output should look like a finished jewelry charm, therefore ensure it is a one piece casting, don't keep sharp edges as well. there should be no color used apart from gold."
}`,
							},
							{
								type: 'image_url',
								image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
							},
						],
					},
				],
				max_tokens: 400,
				temperature: 0.4,
			}),
		});

		clearTimeout(timeoutId);

		if (!openaiResponse.ok) {
			const errorBody = await openaiResponse.text();
			console.error('OpenAI Vision API Error Details:', {
				status: openaiResponse.status,
				statusText: openaiResponse.statusText,
				body: errorBody,
			});
			throw new Error(`OpenAI Vision API error: ${openaiResponse.status}`);
		}

		const result = (await openaiResponse.json()) as any;
		const content = result.choices?.[0]?.message?.content;

		console.log('🧠 OpenAI Vision raw content:', content);

		const parsed = parseJsonFromContent(String(content));
		const responseTime = Date.now() - startTime;
		console.log(`⏱️ OpenAI Vision took: ${responseTime}ms`);

		const productName = parsed?.productName || 'Custom Charm';
		const story = parsed?.story || 'A beautiful memory captured in a charm, ready to be treasured forever.';
		const prompt =
			parsed?.prompt ||
			"Convert the input image into a 3D figurine gold charm. Image style- product photography. product centered on a white background. keep a small loop at the top. output should look like a finished jewelry charm, therefore ensure it is a one piece casting, don't keep sharp edges as well. there should be no color used apart from gold.";

		return { productName, story, prompt };
	} catch (error) {
		clearTimeout(timeoutId);
		const responseTime = Date.now() - startTime;
		console.error(`❌ OpenAI Vision failed after ${responseTime}ms:`, error);
		// Safe fallbacks
		return {
			productName: 'Custom Charm',
			story: 'A beautiful memory captured in a charm, ready to be treasured forever.',
			prompt:
				"Convert the input image into a 3D figurine gold charm. Image style- product photography. product centered on a white background. keep a small loop at the top. output should look like a finished jewelry charm, therefore ensure it is a one piece casting, don't keep sharp edges as well. there should be no color used apart from gold.",
		};
	}
}
