import { createClient } from '@supabase/supabase-js';
import * as JPEG from 'jpeg-js';
import UPNG from 'upng-js';

interface CreateCharmRequest {
	image: File;
	email: string;
	publicGallery: boolean;
	story?: string;
	inspiration?: string;
}

// Groq Vision: generate productName, story, and a tailored Fal prompt
async function generateGroqVisionPrompt(
  imageBase64: string,
  env: Env
): Promise<{ productName: string; story: string; prompt: string }> {
  const startTime = Date.now();
  console.log('🎯 Generating product name, story, and prompt with Groq Vision...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    // Keep the same default model as previously used elsewhere
    const model = (env as any).GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${(env as any).GROQ_API_KEY}`,
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
}`
              },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
              }
            ]
          }
        ],
        max_tokens: 400,
        temperature: 0.4
      })
    });

    clearTimeout(timeoutId);

    if (!groqResponse.ok) {
      const errorBody = await groqResponse.text();
      console.error('Groq Vision API Error Details:', {
        status: groqResponse.status,
        statusText: groqResponse.statusText,
        body: errorBody
      });
      throw new Error(`Groq Vision API error: ${groqResponse.status}`);
    }

    const result = await groqResponse.json() as any;
    const content = result.choices?.[0]?.message?.content;

    console.log('🧠 Groq Vision raw content:', content);

    const parsed = parseJsonFromContent(String(content));
    const responseTime = Date.now() - startTime;
    console.log(`⏱️ Groq Vision took: ${responseTime}ms`);

    const productName = parsed?.productName || 'Custom Charm';
    const story = parsed?.story || 'A beautiful memory captured in a charm, ready to be treasured forever.';
    const prompt = parsed?.prompt || 'Convert the input image into a 3D figurine gold charm. Image style- product photography. product centered on a white background. keep a small loop at the top. output should look like a finished jewelry charm, therefore ensure it is a one piece casting, don\'t keep sharp edges as well. there should be no color used apart from gold.';

    return { productName, story, prompt };
  } catch (error) {
    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;
    console.error(`❌ Groq Vision failed after ${responseTime}ms:`, error);
    // Safe fallbacks
    return {
      productName: 'Custom Charm',
      story: 'A beautiful memory captured in a charm, ready to be treasured forever.',
      prompt: 'Convert the input image into a 3D figurine gold charm. Image style- product photography. product centered on a white background. keep a small loop at the top. output should look like a finished jewelry charm, therefore ensure it is a one piece casting, don\'t keep sharp edges as well. there should be no color used apart from gold.'
    };
  }
}


// Helper to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const chunkSize = 8192;
	let binary = '';
	
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	
	return btoa(binary);
}

// Bilinear interpolation resize helper
function bilinearResize(srcData: Uint8ClampedArray, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): Uint8ClampedArray {
	const dstData = new Uint8ClampedArray(dstWidth * dstHeight * 4);
	const xRatio = srcWidth / dstWidth;
	const yRatio = srcHeight / dstHeight;
	
	for (let dstY = 0; dstY < dstHeight; dstY++) {
		for (let dstX = 0; dstX < dstWidth; dstX++) {
			const srcX = dstX * xRatio;
			const srcY = dstY * yRatio;
			
			const srcX0 = Math.floor(srcX);
			const srcY0 = Math.floor(srcY);
			const srcX1 = Math.min(srcX0 + 1, srcWidth - 1);
			const srcY1 = Math.min(srcY0 + 1, srcHeight - 1);
			
			const xWeight = srcX - srcX0;
			const yWeight = srcY - srcY0;
			
			const dstIdx = (dstY * dstWidth + dstX) * 4;
			
			for (let c = 0; c < 4; c++) {
				const tl = srcData[(srcY0 * srcWidth + srcX0) * 4 + c];
				const tr = srcData[(srcY0 * srcWidth + srcX1) * 4 + c];
				const bl = srcData[(srcY1 * srcWidth + srcX0) * 4 + c];
				const br = srcData[(srcY1 * srcWidth + srcX1) * 4 + c];
				
				const top = tl + (tr - tl) * xWeight;
				const bottom = bl + (br - bl) * xWeight;
				dstData[dstIdx + c] = top + (bottom - top) * yWeight;
			}
		}
	}
	
	return dstData;
}

// Local fallback: resize to 1024x1024 with padding and convert to grayscale.
// This is used only when Cloudflare URL transformations cannot fetch the source image
// (e.g., when running `wrangler dev` with local R2 buckets).
async function resizeAndGrayscaleTo1024(buffer: ArrayBuffer, imageType: string): Promise<string> {
	console.log('🖼️ Resizing image to 1024x1024 and converting to grayscale (local fallback)...');
	const startTime = Date.now();

	try {
		const uint8Array = new Uint8Array(buffer);
		let imageData: { data: Uint8ClampedArray; width: number; height: number };

		// Decode based on image type
		if (imageType.includes('png')) {
			const png = UPNG.decode(uint8Array.buffer);
			const rgba = UPNG.toRGBA8(png)[0];
			imageData = {
				data: new Uint8ClampedArray(rgba),
				width: png.width,
				height: png.height
			};
		} else {
			const decoded = JPEG.decode(uint8Array, { useTArray: true });
			imageData = {
				data: new Uint8ClampedArray(decoded.data.buffer),
				width: decoded.width,
				height: decoded.height
			};
		}

		const targetSize = 1024;
		const aspectRatio = imageData.width / imageData.height;

		let scaledWidth: number;
		let scaledHeight: number;

		if (imageData.width > imageData.height) {
			scaledWidth = targetSize;
			scaledHeight = Math.round(targetSize / aspectRatio);
		} else {
			scaledHeight = targetSize;
			scaledWidth = Math.round(targetSize * aspectRatio);
		}

		// Resize to scaled dimensions
		const resizedData = bilinearResize(
			imageData.data,
			imageData.width,
			imageData.height,
			scaledWidth,
			scaledHeight
		);

		// Create padded canvas (white background)
		const finalData = new Uint8ClampedArray(targetSize * targetSize * 4);
		for (let i = 0; i < finalData.length; i += 4) {
			finalData[i] = 255;
			finalData[i + 1] = 255;
			finalData[i + 2] = 255;
			finalData[i + 3] = 255;
		}

		const offsetX = Math.floor((targetSize - scaledWidth) / 2);
		const offsetY = Math.floor((targetSize - scaledHeight) / 2);

		for (let y = 0; y < scaledHeight; y++) {
			for (let x = 0; x < scaledWidth; x++) {
				const srcIdx = (y * scaledWidth + x) * 4;
				const dstIdx = ((y + offsetY) * targetSize + (x + offsetX)) * 4;

				finalData[dstIdx] = resizedData[srcIdx];
				finalData[dstIdx + 1] = resizedData[srcIdx + 1];
				finalData[dstIdx + 2] = resizedData[srcIdx + 2];
				finalData[dstIdx + 3] = resizedData[srcIdx + 3];
			}
		}

		// Convert to grayscale in-place (preserves alpha)
		for (let i = 0; i < finalData.length; i += 4) {
			const r = finalData[i];
			const g = finalData[i + 1];
			const b = finalData[i + 2];
			// ITU-R BT.601 luma approximation
			const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
			finalData[i] = y;
			finalData[i + 1] = y;
			finalData[i + 2] = y;
		}

		// Encode to JPEG
		const encoded = JPEG.encode({
			data: finalData,
			width: targetSize,
			height: targetSize
		}, 95);

		const base64 = arrayBufferToBase64(encoded.data.buffer as ArrayBuffer);
		console.log(`⏱️ Local grayscale+resize took: ${Date.now() - startTime}ms`);
		return base64;
	} catch (error) {
		console.error('❌ Error in local grayscale+resize fallback:', error);
		// Absolute fallback: just return original as base64 (no resize)
		return arrayBufferToBase64(buffer);
	}
}

function getSupabase(env: Env) {
  console.log('🔗 Connecting to Supabase...');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { fetch },
  });
}

// Helper to robustly parse JSON that may be wrapped in Markdown code fences
function parseJsonFromContent(content: string): any {
  if (typeof content !== 'string') return content;
  const raw = content.trim();

  // 1) Try direct JSON first
  try { return JSON.parse(raw); } catch {}

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

async function saveGenerationRow(env: Env, params: {
  shopifyProductId: number;
  email: string;
  generationMethod: 'image_to_charm' | 'text_to_charm' | string;
  productCategory: string; // 'pendant_charm' | 'bracelet_charm' | 'ring' | ...
  inputImageUrl?: string | null;
  inputPrompt?: string | null;
  originalImageUrl?: string | null;
  goldImageUrl?: string | null;
  silverImageUrl?: string | null;
  inspirationText?: string | null;
  publicGallery?: boolean;
  attributes?: Record<string, any>;
}) {
  console.log('💾 Saving generation data to Supabase for product:', params.shopifyProductId);
  const supabase = getSupabase(env);

  const assets = [
    params.goldImageUrl     && { role: 'gold',     url: params.goldImageUrl },
    params.silverImageUrl   && { role: 'silver',   url: params.silverImageUrl },
    params.originalImageUrl && { role: 'original', url: params.originalImageUrl },
  ].filter(Boolean);

  console.log('📊 Generation data:', {
    shopifyProductId: params.shopifyProductId,
    email: params.email,
    generationMethod: params.generationMethod,
    assetsCount: assets.length,
    publicGallery: params.publicGallery
  });

  const { error } = await supabase.from('product_generation').upsert({
    shopify_product_id: params.shopifyProductId,
    user_email: params.email.trim().toLowerCase(),
    generation_method: params.generationMethod,
    product_category: params.productCategory,
    input_image_url: params.inputImageUrl ?? null,
    input_prompt: params.inputPrompt ?? null,
    assets,
    attributes: params.attributes ?? {},
    inspiration_text: params.inspirationText ?? null,
    public_gallery: !!params.publicGallery,
  }, { onConflict: 'shopify_product_id' });

  if (error) {
    console.error('❌ Supabase save failed:', error);
    throw error;
  }
  
  console.log('✅ Successfully saved generation data to Supabase');
}

// Helper function to upload image to Cloudflare R2 storage
async function uploadImageToR2(
	imageBuffer: ArrayBuffer,
	filename: string,
	productId: string,
	env: Env,
	options?: {
		contentType?: string;
		typeMetadata?: string;
	}
): Promise<string> {
	try {
		console.log(`🔄 Attempting to upload ${filename} to R2 (${imageBuffer.byteLength} bytes)...`);
		
		// Create the R2 bucket binding
		const bucket = env.USER_UPLOADS_BUCKET;
		console.log('🔍 Debug: bucket value:', !!bucket);
		console.log('🔍 Debug: bucket type:', typeof bucket);
		
		// Check if bucket is available
		if (!bucket) {
			console.log('⚠️ R2 bucket not available, using fallback URL');
			return `https://storage.example.com/uploads/${filename}`;
		}
		
		console.log('📤 Uploading to R2...');
		// Upload to R2 with metadata
		await bucket.put(filename, imageBuffer, {
			httpMetadata: {
				contentType: options?.contentType || 'application/octet-stream',
			},
			customMetadata: {
				productId: productId,
				uploadedAt: new Date().toISOString(),
				type: options?.typeMetadata || 'image'
			}
		});
		
		console.log('✅ Successfully uploaded to R2!');
		
		// TEMPORARY FIX: Since you're running npm run dev --remote, use dev bucket URL
		// TODO: Implement proper environment detection later
		console.log('🔍 Debug: env.ENVIRONMENT =', env.ENVIRONMENT);
		console.log('🔍 Debug: using DEV bucket URL for testing');
		
		const publicUrl = `https://pub-a60a2e7f4821493380ef9f646ab6b33c.r2.dev/${filename}`; // dev bucket URL
		
		console.log(`🌐 Generated public URL: ${publicUrl}`);
		return publicUrl;
	} catch (error) {
		console.error('Error uploading to R2:', error);
		// Fallback to mock URL if R2 upload fails
		return `https://storage.example.com/uploads/${filename}`;
	}
}

function buildCloudflareImageTransformUrl(inputUrl: string, options: {
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

// Retry helper function
async function retryWithBackoff<T>(
	operation: () => Promise<T>,
	maxRetries: number = 2,
	baseDelay: number = 1000
): Promise<T> {
	let lastError: Error;
	
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;
			
			if (attempt === maxRetries) {
				throw lastError;
			}
			
			const delay = baseDelay * Math.pow(2, attempt);
			console.log(`⏳ Retry attempt ${attempt + 1}/${maxRetries + 1} in ${delay}ms...`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}
	
	throw lastError!;
}

// Optimized Qwen Image Edit LoRA API integration with retry and faster settings
async function generateGoldImage(imageBase64: string, env: Env, prompt?: string): Promise<string> {
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
async function convertToGreyscale(goldCharmImageUrl: string, env: Env): Promise<string> {
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

/**
 * Create a new Shopify product with multiple images and variants
 */
export async function createShopifyProduct(
  originalImageUrl: string,
  silverImageUrl: string,
  goldImageUrl: string,
  story: string,
  productName: string,
  email: string,
  publicGallery: boolean,
  env: { SHOPIFY_STORE_URL: string; SHOPIFY_ACCESS_TOKEN: string; ENVIRONMENT?: string }
): Promise<{ url: string; productId: number; handle: string }> {
  // Shopify asset URLs for size reference images
  const sizeReferenceImageUrl = "https://pub-a60a2e7f4821493380ef9f646ab6b33c.r2.dev/Untitled-1.jpg";

  // Shopify API version (update to the latest when needed)
  const API_VERSION = "2025-01";

  // Helper to make Shopify API requests
  async function shopifyFetch(endpoint: string, options: RequestInit) {
    const response = await fetch(`${env.SHOPIFY_STORE_URL}/admin/api/${API_VERSION}${endpoint}`, {
      ...options,
      headers: {
        "X-Shopify-Access-Token": env.SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Shopify API Error:", {
        status: response.status,
        statusText: response.statusText,
        endpoint,
        errorText,
      });
      throw new Error(`Shopify API request failed (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  // Create the product with all images as product images first
  const productPayload = {
    product: {
      title: productName,
      body_html: `
        <div class="custom-charm-description">
          <p>${story}</p>
        </div>
      `,
      vendor: "Custom Jewelry Co.",
      product_type: "Jewelry Charm",
      tags: ["custom", "charm", "jewelry", "personalized", "ai-generated"],
      status: "active",
      published: true,
      images: [
        { src: silverImageUrl, alt: "Silver Charm Version", position: 1 },
        { src: goldImageUrl, alt: "Gold Charm Version", position: 2 },
        { src: sizeReferenceImageUrl, alt: "Size Reference", position: 3 },
      ],
      variants: [
		  {
          option1: "Brass & Resin",
			 	price: "3999.99",
		  compare_at_price: "5999.99",
          sku: `CHARM-BRASS-${crypto.randomUUID()}`,
          inventory_quantity: 1,
          inventory_management: "shopify",
          inventory_policy: "deny",
          fulfillment_service: "manual",
          weight: 0.1,
          weight_unit: "oz",
          requires_shipping: true,
          taxable: true,
		  },
		  {
          option1: "Sterling Silver",
			 	price: "5999.99",
		  compare_at_price: "8999.99",
          sku: `CHARM-SILVER-${crypto.randomUUID()}`,
          inventory_quantity: 1,
          inventory_management: "shopify",
          inventory_policy: "deny",
          fulfillment_service: "manual",
          weight: 0.1,
          weight_unit: "oz",
          requires_shipping: true,
          taxable: true,
		  },
		          {
          option1: "14K Gold",
			  price: "59999.99",
		  compare_at_price: "69999.99", 
          sku: `CHARM-14K-${crypto.randomUUID()}`,
          inventory_quantity: 1,
          inventory_management: "shopify",
          inventory_policy: "deny",
          fulfillment_service: "manual",
          weight: 0.15,
          weight_unit: "oz",
          requires_shipping: true,
          taxable: true,
		  },
		  {
          option1: "Gold Vermeil",
			  price: "14999.99",
		  compare_at_price: "19999.99",
          sku: `CHARM-VERMEIL-${crypto.randomUUID()}`,
          inventory_quantity: 1,
          inventory_management: "shopify",
          inventory_policy: "deny",
          fulfillment_service: "manual",
          weight: 0.12,
          weight_unit: "oz",
          requires_shipping: true,
          taxable: true,
        },
      ],
      options: [
        {
          name: "Material",
          values: ["Brass & Resin", "Sterling Silver", "Gold Vermeil", "14K Gold"],
        },
      ],
    },
  };

  const response = await shopifyFetch("/products.json", {
    method: "POST",
    body: JSON.stringify(productPayload),
  });

  if (!response || typeof response !== "object" || !("product" in response)) {
    throw new Error("Failed to create product: Unexpected Shopify API response");
  }

  const { product } = response as { product: { id: number; handle: string; variants: any[] } };

  // Now assign specific images to variants
  const goldVariant = product.variants.find(v => v.option1 === "14K Gold");
  const silverVariant = product.variants.find(v => v.option1 === "Sterling Silver");
  const vermeilVariant = product.variants.find(v => v.option1 === "Gold Vermeil");
  const brassResinVariant = product.variants.find(v => v.option1 === "Brass & Resin");

  // Group gold-like variants (Gold, Vermeil, Brass & Resin) to share the same image
  const goldGroupVariantIds = [goldVariant, vermeilVariant, brassResinVariant]
    .filter(Boolean)
    .map((v: any) => v.id);

  // Update images to be variant-specific
  const updatedImages = [
    { 
      src: silverImageUrl, 
      alt: "Sterling Silver Charm Version", 
      position: 1,
      variant_ids: silverVariant ? [silverVariant.id] : undefined
    },
    { 
      src: goldImageUrl, 
      alt: "Gold Charm Version", 
      position: 2,
      variant_ids: goldGroupVariantIds.length ? goldGroupVariantIds : undefined
    },
    { 
      src: sizeReferenceImageUrl, 
      alt: "Size Reference", 
      position: 3 
      // No variant_ids means it shows for all variants
    },
  ];

  // Update the product with variant-specific image assignments
  await shopifyFetch(`/products/${product.id}.json`, {
    method: "PUT",
    body: JSON.stringify({
      product: {
        id: product.id,
        images: updatedImages
      }
    }),
  });

  // 3. Add to "By the Community" collection if publicGallery is true
  if (publicGallery) {
    try {
      // Add product to collection using the correct API format
      await shopifyFetch(`/collects.json`, {
        method: "POST",
        body: JSON.stringify({
          collect: {
            product_id: product.id,
            collection_id: 323241443525
          }
        })
      });
      console.log(`✅ Product ${product.id} added to "By the Community" collection`);
    } catch (error) {
      console.error("❌ Error adding product to collection:", error);
      // Don't fail the entire request if collection addition fails
    }
  }

  // 4. Return product data
  return {
    url: `${env.SHOPIFY_STORE_URL.replace("/admin", "")}/products/${product.handle}`,
    productId: product.id,
    handle: product.handle
  };
}


async function handleCreateCharm(request: Request, env: Env): Promise<Response> {
	const startTime = Date.now();
	try {
		console.log('🔍 Parsing form data...');
		// Parse the form data
		const formData = await request.formData();
		console.log('🔍 Form data keys:', Array.from(formData.keys()));
		
		const image = formData.get('image') as File;
		const email = formData.get('email') as string;
		const publicGallery = formData.get('publicGallery') === 'true';
		const story = formData.get('story') as string || '';
		const inspiration = formData.get('inspiration') as string || '';

		console.log('🔍 Validation - image:', !!image, 'email:', !!email);
		console.log('🔍 Image type:', image?.type, 'size:', image?.size);

		// Basic validation
		if (!image || !email) {
			return Response.json(
				{ 
					success: false, 
					error: 'Missing required fields: image and email are required' 
				},
				{ status: 400 }
			);
		}

		console.log(`⏱️ Request started at ${startTime}ms for ${email}`);

		// Step 0: IDs used for storage + metadata
		const productId = Date.now().toString();
		const randomId = crypto.randomUUID();

		// Step 1: Upload original image to Cloudflare R2 (no local resize / storage)
		const fileProcessingStart = Date.now();
		const originalImageBuffer = await image.arrayBuffer();

		// Use file extension that matches the upload type for better compatibility
		const isPng = (image.type || '').includes('png');
		const originalExt = isPng ? 'png' : 'jpg';

		const originalImageUrl = await uploadImageToR2(
			originalImageBuffer,
			`${randomId}.${originalExt}`,
			productId,
			env,
			{
				contentType: image.type || (isPng ? 'image/png' : 'image/jpeg'),
				typeMetadata: 'original-image',
			}
		);

		console.log(`✅ Original image uploaded to R2: ${originalImageUrl}`);

		// Step 2: Create a grayscale + 1024x1024 (padded) JPEG via Cloudflare transform
		const grayscale1024Url = buildCloudflareImageTransformUrl(originalImageUrl, {
			saturation: 0,
			width: 1024,
			height: 1024,
			fit: 'pad',
			background: 'white',
			format: 'jpeg',
		});

		console.log('🧪 Cloudflare transformed input URL:', grayscale1024Url);

		let grayscale1024Base64: string;
		let groqInputKind: string = 'cloudflare_grayscale_1024_pad_white_jpeg';

		try {
			const grayscaleResponse = await fetch(grayscale1024Url);
			if (!grayscaleResponse.ok) {
				const errText = await grayscaleResponse.text().catch(() => '');
				throw new Error(`Cloudflare transform failed (${grayscaleResponse.status}): ${errText}`);
			}

			const grayscale1024Buffer = await grayscaleResponse.arrayBuffer();
			grayscale1024Base64 = arrayBufferToBase64(grayscale1024Buffer);
		} catch (e) {
			// Most common in local dev: R2 binding is "local" so the public r2.dev URL doesn't contain the object.
			// Fallback to local processing so the request still succeeds in development.
			console.warn('⚠️ Cloudflare transform unavailable; using local grayscale+resize fallback.', e);
			grayscale1024Base64 = await resizeAndGrayscaleTo1024(originalImageBuffer, image.type || 'image/jpeg');
			groqInputKind = 'local_fallback_grayscale_1024_pad_white_jpeg';
		}

		console.log(`⏱️ File + transform processing took: ${Date.now() - fileProcessingStart}ms`);

		// Step 3: Sequential AI processing - Groq Vision → Fal → grayscale (silver)
		console.log('🚶 Starting sequential AI processing with Groq Vision (grayscale input)...');
		const aiProcessingStart = Date.now();

		// 3a) Get Groq Vision prompt (and name/story) using grayscale + resized Cloudflare output
		const groqVision = await generateGroqVisionPrompt(grayscale1024Base64, env);
		console.log('📝 Using Groq Vision prompt (preview):', groqVision.prompt.slice(0, 160));

		// Keep external behavior: if user provided a story, keep it and default productName to 'Custom Charm'
		const nameAndStory = story
			? { productName: 'Custom Charm', story }
			: { productName: groqVision.productName, story: groqVision.story };

		// 3b) Generate gold image using Fal with the grayscale input image and Groq prompt
		const goldImageUrl = await generateGoldImage(grayscale1024Base64, env, groqVision.prompt);

		// 3c) Convert gold to grayscale for silver
		const silverImageUrl = await convertToGreyscale(goldImageUrl, env);

		console.log(`⏱️ Sequential AI processing took: ${Date.now() - aiProcessingStart}ms`);
		console.log('✅ Sequential processing completed. Generated:', {
			productName: nameAndStory.productName,
			storyLength: nameAndStory.story.length,
			silverImageGenerated: !!silverImageUrl,
			goldImageGenerated: !!goldImageUrl
		});

		// Step 4: Final operation - Shopify product creation
		const finalOpsStart = Date.now();

		const createdProduct = await createShopifyProduct(
			'', // No original image in Shopify product
			silverImageUrl,
			goldImageUrl,
			nameAndStory.story,
			nameAndStory.productName,
			email,
			publicGallery,
			env
		);

		console.log(`⏱️ Final operations took: ${Date.now() - finalOpsStart}ms`);

		// Save generation data to Supabase
		await saveGenerationRow(env, {
			shopifyProductId: createdProduct.productId,
			email,
			generationMethod: 'image_to_charm',
			productCategory: 'pendant_charm',
			inputImageUrl: originalImageUrl,
			inputPrompt: groqVision.prompt || null,
			originalImageUrl: originalImageUrl,
			goldImageUrl,
			silverImageUrl,
			inspirationText: inspiration || null,
			publicGallery,
			attributes: {
				groq_input_transform_url: grayscale1024Url,
				groq_input_kind: groqInputKind,
			}
		});

		const totalTime = Date.now() - startTime;
		console.log(`⏱️ TOTAL REQUEST TIME: ${totalTime}ms`);

		// Step 4: Return success response with timing data
		return Response.json({
			success: true,
			productUrl: createdProduct.url,
			data: {
				originalImageUrl: originalImageUrl,
				silverImageUrl,
				goldImageUrl,
				story: nameAndStory.story,
				inspiration,
				email,
				publicGallery,
				timestamp: new Date().toISOString()
			},
			performance: {
				totalTimeMs: totalTime,
				breakdown: {
					fileProcessing: fileProcessingStart,
					aiProcessing: aiProcessingStart,
					finalOperations: finalOpsStart
				}
			}
		});

	} catch (error) {
		const totalTime = Date.now() - startTime;
		console.error(`❌ Error after ${totalTime}ms processing charm creation:`, error);
		return Response.json(
			{ 
				success: false, 
				error: 'Internal server error',
				details: error instanceof Error ? error.message : 'Unknown error',
				performanceMs: totalTime
			},
			{ status: 500 }
		);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log('🚀 Worker started - Request received:', request.method, request.url);
		const url = new URL(request.url);
		
		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
		}

		// Route handling
		if (request.method === 'POST' && url.pathname === '/api/create-jewelry-charm') {
			try {
				console.log('📝 Processing request body...');
			const response = await handleCreateCharm(request, env);
			
			// Add CORS headers to the response
			response.headers.set('Access-Control-Allow-Origin', '*');
			response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
			
			return response;
			} catch (error) {
				console.error('❌ Error in request handler:', error);
				const errorResponse = new Response(
					JSON.stringify({
						success: false,
						error: 'Request processing failed',
						details: error instanceof Error ? error.message : 'Unknown error'
					}),
					{ 
						status: 400,
						headers: { 
							'Content-Type': 'application/json',
							'Access-Control-Allow-Origin': '*',
							'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
							'Access-Control-Allow-Headers': 'Content-Type'
						}
					}
				);
				return errorResponse;
			}
		}

		// Default route
		if (url.pathname === '/' || url.pathname === '/health') {
			return Response.json({
				message: 'Jewelry API is running',
				environment: env.ENVIRONMENT,
				endpoints: {
					'POST /api/create-jewelry-charm': 'Create a custom jewelry charm from an image'
				},
				timestamp: new Date().toISOString()
			});
		}

		// 404 for unmatched routes
		return Response.json(
			{ error: 'Not found' },
			{ status: 404 }
		);
	},
} satisfies ExportedHandler<Env>;
