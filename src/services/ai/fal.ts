import { retryWithBackoff } from '../../utils/retry';
import { uploadImageToR2 } from '../storage/r2';

// Optimized Qwen Image Edit LoRA API integration with retry and faster settings
export async function generateGoldImage(imageBase64: string, env: Env, prompt?: string): Promise<string> {
	const startTime = Date.now();
	console.log('🥇 Calling Qwen Image Edit LoRA API for gold version...');

	const defaultPrompt = 'Convert the input image into a 3D figurine gold charm. Image style- product photography. product centered on a white background. keep a small loop at the top. output should look like a finished jewelry charm, therefore ensure it is a one piece casting, don\'t keep sharp edges as well. there should be no color used apart from gold.';
	const finalPrompt = (prompt && prompt.trim().length > 0) ? prompt : defaultPrompt;
	console.log('📝 Fal prompt (preview):', finalPrompt.slice(0, 160));
	
	return await retryWithBackoff(async () => {
		// Increased timeout to 90s and optimized parameters for speed
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 90000);
		
		try {
	const falResponse = await fetch('https://fal.run/fal-ai/qwen-image-edit-lora', {
		method: 'POST',
		headers: {
			'Authorization': `Key ${env.FAL_API_KEY}`,
			'Content-Type': 'application/json',
		},
				signal: controller.signal,
		body: JSON.stringify({
			image_url: `data:image/jpeg;base64,${imageBase64}`,
					prompt: finalPrompt,
					num_inference_steps: 50,
					guidance_scale: 4, // Using the default from the playground
			num_images: 1,
					output_format: 'jpeg', // JPEG is faster than PNG
			loras: [{
				path: 'https://v3b.fal.media/files/b/elephant/26yNtCrAVeYIwHAaEv-Dw_pytorch_lora_weights.safetensors',
				scale: 1.0
			}]
		})
	});
			
			clearTimeout(timeoutId);

	if (!falResponse.ok) {
		const errorBody = await falResponse.text();
		console.error('Qwen Image Edit LoRA API Error:', {
			status: falResponse.status,
			statusText: falResponse.statusText,
			body: errorBody
		});
		throw new Error(`Qwen Image Edit LoRA API error: ${falResponse.status} - ${errorBody}`);
	}

	const result = await falResponse.json() as any;
			const responseTime = Date.now() - startTime;
			console.log(`⏱️ Qwen Image Edit LoRA API took: ${responseTime}ms`);
	return result.images[0].url;
			
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}, 1); // Only 1 retry to avoid excessive delays
}

// Function to convert gold charm image URL to greyscale for silver charm using Cloudflare Image Transformation
export async function convertToGreyscale(goldCharmImageUrl: string, env: Env): Promise<string> {
	const startTime = Date.now();
	console.log('🔘 Converting gold charm image to greyscale for silver charm using Cloudflare...');
	
	try {
		let grayscaleArrayBuffer: ArrayBuffer;
		
		// Use Cloudflare image transformation URL (now working on api.beuken.ai)
		try {
			const transformationUrl = `https://api.beuken.ai/cdn-cgi/image/saturation=0,format=jpeg/${goldCharmImageUrl}`;
			console.log(`🔄 Converting to grayscale using URL transformation: ${transformationUrl}`);
			
			const response = await fetch(transformationUrl);
			
			if (!response.ok) {
				throw new Error(`Cloudflare URL transformation failed: ${response.status}`);
			}
			
			grayscaleArrayBuffer = await response.arrayBuffer();
			console.log(`✅ Cloudflare URL transformation successful: ${grayscaleArrayBuffer.byteLength} bytes`);
			
		} catch (urlError) {
			console.log(`⚠️ URL transformation failed, trying Workers API: ${urlError}`);
			
			// Fallback: Try Workers cf.image API
			try {
				const response = await fetch(goldCharmImageUrl, {
					cf: {
						image: {
							saturation: 0,
							format: 'jpeg'
						}
					}
				});
				
				if (!response.ok) {
					throw new Error(`Cloudflare Workers API failed: ${response.status}`);
				}
				
				grayscaleArrayBuffer = await response.arrayBuffer();
				console.log(`✅ Cloudflare Workers API fallback successful: ${grayscaleArrayBuffer.byteLength} bytes`);
				
			} catch (workersError) {
				console.log(`⚠️ Both methods failed, using original image: ${workersError}`);
				
				// Final fallback: Fetch original image
				const response = await fetch(goldCharmImageUrl);
				if (!response.ok) {
					throw new Error(`Failed to fetch original image: ${response.status}`);
				}
				
				grayscaleArrayBuffer = await response.arrayBuffer();
				console.log(`📥 Using original image as fallback: ${grayscaleArrayBuffer.byteLength} bytes`);
			}
		}
		
		// Upload the processed image to R2
		const randomId = crypto.randomUUID();
		const silverFilename = `${randomId}-silver.jpg`;
		const productId = Date.now().toString();
		
		const silverImageUrl = await uploadImageToR2(grayscaleArrayBuffer, silverFilename, productId, env, {
			contentType: 'image/jpeg',
			typeMetadata: 'silver-image',
		});
		
		const responseTime = Date.now() - startTime;
		console.log(`⏱️ Grayscale conversion and R2 upload took: ${responseTime}ms`);
		
		return silverImageUrl;
		
	} catch (error) {
		console.warn('⚠️ Entire grayscale conversion failed, falling back to original image:', error);
		// Ultimate fallback: return the original gold charm image URL
		const responseTime = Date.now() - startTime;
		console.log(`⏱️ Fallback to original image took: ${responseTime}ms`);
		return goldCharmImageUrl;
	}
}


