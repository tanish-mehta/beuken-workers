import { arrayBufferToBase64 } from '../utils/base64';
import { generateGroqVisionPrompt } from '../services/ai/groqVision';
import { convertToGreyscale, generateGoldImage } from '../services/ai/fal';
import { buildCloudflareImageTransformUrl } from '../services/cloudflare/imageTransform';
import { saveGenerationRow } from '../services/db/supabase';
import { resizeAndGrayscaleTo1024 } from '../services/images/localFallback';
import { createShopifyProduct } from '../services/shopify/createProduct';
import { uploadImageToR2 } from '../services/storage/r2';

export async function handleCreateCharm(request: Request, env: Env): Promise<Response> {
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
		let visionInputKind: string = 'cloudflare_grayscale_1024_pad_white_jpeg';

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
			visionInputKind = 'local_fallback_grayscale_1024_pad_white_jpeg';
		}

		console.log(`⏱️ File + transform processing took: ${Date.now() - fileProcessingStart}ms`);

		// Step 3: Sequential AI processing - OpenAI Vision → Fal → grayscale (silver)
		console.log('🚶 Starting sequential AI processing with OpenAI Vision (grayscale input)...');
		const aiProcessingStart = Date.now();

		// 3a) Get Vision prompt (and name/story) using grayscale + resized Cloudflare output
		const visionResult = await generateGroqVisionPrompt(grayscale1024Base64, env);
		console.log('📝 Using Vision prompt (preview):', visionResult.prompt.slice(0, 160));

		// Keep external behavior: if user provided a story, keep it and default productName to 'Custom Charm'
		const nameAndStory = story
			? { productName: 'Custom Charm', story }
			: { productName: visionResult.productName, story: visionResult.story };

		// 3b) Generate gold image using Fal with the grayscale input image and vision prompt
		const goldImageUrl = await generateGoldImage(grayscale1024Base64, env, visionResult.prompt);

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
			inputPrompt: visionResult.prompt || null,
			originalImageUrl: originalImageUrl,
			goldImageUrl,
			silverImageUrl,
			inspirationText: inspiration || null,
			publicGallery,
			attributes: {
				// Backward-compatible keys (historically "groq_*")
				groq_input_transform_url: grayscale1024Url,
				groq_input_kind: visionInputKind,
				// New neutral keys
				vision_input_transform_url: grayscale1024Url,
				vision_input_kind: visionInputKind,
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


