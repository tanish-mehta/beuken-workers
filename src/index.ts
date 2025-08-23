interface CreateCharmRequest {
	image: File;
	email: string;
	publicGallery: boolean;
	story?: string;
	inspiration?: string;
}

// Safe helper function to convert File to base64 (handles large files)
async function fileToBase64(file: File): Promise<string> {
	const arrayBuffer = await file.arrayBuffer();
	const bytes = new Uint8Array(arrayBuffer);
	
	// Process in chunks to avoid stack overflow on large images
	const chunkSize = 8192; // 8KB chunks
	let binary = '';
	
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	
	return btoa(binary);
}

// Helper function to upload image to a temporary storage (using a data URL for now)
async function uploadImageToStorage(imageBuffer: ArrayBuffer, filename: string): Promise<string> {
	// In a real implementation, you would upload to Supabase or another storage service
	// For now, we'll return a mock URL
	return `https://storage.example.com/uploads/${filename}`;
}

// Helper function to upload image to Cloudflare R2 storage
async function uploadImageToR2(imageBuffer: ArrayBuffer, filename: string, productId: string, env: Env): Promise<string> {
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
				contentType: 'image/jpeg',
			},
			customMetadata: {
				productId: productId,
				uploadedAt: new Date().toISOString(),
				type: 'original-image'
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

// Optimized Groq API integration with timeout and retry logic
async function generateProductNameAndStory(imageBase64: string, env: Env): Promise<{ productName: string; story: string }> {
	const startTime = Date.now();
	console.log('🎯 Generating product name and story with Groq...');
	
	// Create AbortController for timeout
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
	
	try {
	const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.GROQ_API_KEY}`,
			'Content-Type': 'application/json',
		},
			signal: controller.signal,
		body: JSON.stringify({
			model: 'meta-llama/llama-4-scout-17b-16e-instruct',
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: `Analyze this image and provide:
1. A short, catchy product name (maximum 3 words) for a jewelry charm that will be created from this image
2. A compelling 2-3 sentence product description for the jewelry charm that will be made from this image

Return ONLY a valid JSON object with no markdown formatting, no code blocks, and no additional text:
{
  "productName": "Your Product Name",
  "story": "Your product description here..."
}

Make the product name descriptive and appealing for a jewelry store (examples: "Golden Memory", "Silver Dreams", "Athletic Spirit"). The description should highlight the beauty, craftsmanship, and appeal of the jewelry charm that will be created from this image.`
						},
						{
							type: 'image_url',
							image_url: {
								url: `data:image/jpeg;base64,${imageBase64}`
							}
						}
					]
				}
			],
			max_tokens: 200,
			temperature: 0.7
		})
	});
		
		clearTimeout(timeoutId);

	if (!groqResponse.ok) {
		const errorBody = await groqResponse.text();
		console.error('Groq API Error Details:', {
			status: groqResponse.status,
			statusText: groqResponse.statusText,
			body: errorBody
		});
			throw new Error(`Groq API error: ${groqResponse.status}`);
	}

	const result = await groqResponse.json() as any;
	const content = result.choices[0].message.content;
	
		// Parse JSON response
		const parsed = JSON.parse(content);
		const responseTime = Date.now() - startTime;
		console.log(`⏱️ Groq API took: ${responseTime}ms`);
		
		return {
			productName: parsed.productName || 'Custom Charm',
			story: parsed.story || 'A beautiful memory captured in a charm, ready to be treasured forever.'
		};
		
	} catch (error) {
		clearTimeout(timeoutId);
		const responseTime = Date.now() - startTime;
		console.error(`❌ Groq API failed after ${responseTime}ms:`, error);
		
		// Fallback values if API fails
		return {
			productName: 'Custom Charm',
			story: 'A beautiful memory captured in a charm, ready to be treasured forever.'
		};
	}
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

// Optimized Fal LoRA API integration with retry and faster settings
async function generateGoldImage(imageBase64: string, env: Env): Promise<string> {
	const startTime = Date.now();
	console.log('🥇 Calling Fal Flux Kontext LoRA API for gold version...');
	
	return await retryWithBackoff(async () => {
		// Increased timeout to 90s and optimized parameters for speed
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 90000);
		
		try {
	const falResponse = await fetch('https://fal.run/fal-ai/flux-kontext-lora', {
		method: 'POST',
		headers: {
			'Authorization': `Key ${env.FAL_API_KEY}`,
			'Content-Type': 'application/json',
		},
				signal: controller.signal,
		body: JSON.stringify({
			image_url: `data:image/jpeg;base64,${imageBase64}`,
					prompt: 'Convert input photos into highly detailed gold pendant charms with a realistic 3D metallic embossed style, preserving likeness and fine features, using silvercharmstyle. output should be castable. keep a plain white background.',
					num_inference_steps: 40, // Further reduced for speed
					guidance_scale: 2.5, // Slightly lower for faster processing
			num_images: 1,
					output_format: 'jpeg', // JPEG is faster than PNG
					width: 1024, // Reduced resolution for faster processing
			height: 1024,
			loras: [{
				path: 'https://v3.fal.media/files/koala/6BA9zqC6v0YIbZXy-5fb7_adapter_model.safetensors',
				scale: 1.0
			}]
		})
	});
			
			clearTimeout(timeoutId);

	if (!falResponse.ok) {
		const errorBody = await falResponse.text();
		console.error('Fal LoRA API Error:', {
			status: falResponse.status,
			statusText: falResponse.statusText,
			body: errorBody
		});
		throw new Error(`Fal LoRA API error: ${falResponse.status} - ${errorBody}`);
	}

	const result = await falResponse.json() as any;
			const responseTime = Date.now() - startTime;
			console.log(`⏱️ Fal LoRA API took: ${responseTime}ms`);
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
		
		const silverImageUrl = await uploadImageToR2(grayscaleArrayBuffer, silverFilename, productId, env);
		
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

// Optimized Fal Flux Kontext API integration for enhancing gold image with retry and faster settings  
async function enhanceGoldImage(silverImageUrl: string, env: Env): Promise<string> {
	const startTime = Date.now();
	console.log('🥇 Calling Fal Flux Kontext API for gold enhancement...');
	
	return await retryWithBackoff(async () => {
		// Increased timeout to 90s and optimized parameters for speed
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 90000);
		
		try {
	const falResponse = await fetch('https://fal.run/fal-ai/flux-pro/kontext/max', {
		method: 'POST',
		headers: {
			'Authorization': `Key ${env.FAL_API_KEY}`,
			'Content-Type': 'application/json',
		},
				signal: controller.signal,
		body: JSON.stringify({
			image_url: silverImageUrl,
			prompt: 'Convert the object in this image into a polished gold version. Maintain the exact shape, proportions, and details of the original object. Render it as shiny metallic gold with realistic reflections, highlights, and shadows. Ensure the gold looks like 24k jewelry-quality metal — smooth, glossy, and professional. Keep the background and composition unchanged.',
					num_inference_steps: 20, // Further reduced for speed
					guidance_scale: 2.0, // Slightly lower for faster processing  
			num_images: 1,
					output_format: 'jpeg', // JPEG is faster than PNG
					width: 512, // Reduced resolution for faster processing
					height: 512
		})
	});
			
			clearTimeout(timeoutId);

	if (!falResponse.ok) {
		const errorBody = await falResponse.text();
		console.error('Fal Flux Kontext Max API Error:', {
			status: falResponse.status,
			statusText: falResponse.statusText,
			body: errorBody
		});
		throw new Error(`Fal Flux Kontext Max API error: ${falResponse.status} - ${errorBody}`);
	}

	const result = await falResponse.json() as any;
			const responseTime = Date.now() - startTime;
			console.log(`⏱️ Fal Flux Kontext Max API took: ${responseTime}ms`);
	return result.images[0].url;
			
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}, 1); // Only 1 retry to avoid excessive delays
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
): Promise<string> {
  // Shopify asset URLs for size reference images
  const sizeReferenceImageUrl = "https://cdn.shopify.com/s/files/1/0723/9231/0981/files/reference_pendant.png?v=1753711473";

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
          option1: "Sterling Silver",
			 	price: "8999.99",
		  compare_at_price: "13999.99",
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
          values: ["Sterling Silver", "Gold Vermeil", "14K Gold"],
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
      variant_ids: goldVariant && vermeilVariant ? [goldVariant.id, vermeilVariant.id] : goldVariant ? [goldVariant.id] : undefined
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

  // 4. Return product URL
  return `${env.SHOPIFY_STORE_URL.replace("/admin", "")}/products/${product.handle}`;
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

		// Step 1: Parallel file processing - convert to base64 and buffer simultaneously
		const fileProcessingStart = Date.now();
		const [imageBase64, originalImageBuffer] = await Promise.all([
			fileToBase64(image),
			image.arrayBuffer()
		]);
		console.log(`⏱️ File processing took: ${Date.now() - fileProcessingStart}ms`);

		// Step 2: Maximum parallelization - start all independent operations at once
		console.log('🚀 Starting maximum parallel processing...');
		const parallelStart = Date.now();
		
		// Cache the gold image promise to avoid duplicate API calls
		const goldImagePromise = generateGoldImage(imageBase64, env);
		
		const [nameAndStory, goldImageUrl] = await Promise.all([
			// Generate product name and story (if no story provided)
			story ? 
				Promise.resolve({ productName: 'Custom Charm', story }) : 
				generateProductNameAndStory(imageBase64, env),
			// Generate gold image using Fal LoRA
			goldImagePromise
		]);
		
		// Generate silver image by converting gold to grayscale
		const silverImageUrl = await convertToGreyscale(goldImageUrl, env);

		console.log(`⏱️ Parallel AI processing took: ${Date.now() - parallelStart}ms`);
		console.log('✅ Parallel processing completed. Generated:', {
			productName: nameAndStory.productName,
			storyLength: nameAndStory.story.length,
			silverImageGenerated: !!silverImageUrl,
			goldImageGenerated: !!goldImageUrl
		});

		// Step 3: Parallel final operations - Shopify product creation and R2 upload
		const finalOpsStart = Date.now();
		const productId = Date.now().toString();
		const randomId = crypto.randomUUID();
		
		const [shopifyProductUrl, r2ImageUrl] = await Promise.all([
			createShopifyProduct(
			'', // No original image in Shopify product
			silverImageUrl,
			goldImageUrl,
			nameAndStory.story,
			nameAndStory.productName,
			email,
			publicGallery,
			env
			),
			uploadImageToR2(originalImageBuffer, `${randomId}.jpg`, productId, env)
		]);

		console.log(`⏱️ Final operations took: ${Date.now() - finalOpsStart}ms`);
		console.log(`✅ Original image uploaded to R2: ${r2ImageUrl}`);

		const totalTime = Date.now() - startTime;
		console.log(`⏱️ TOTAL REQUEST TIME: ${totalTime}ms`);

		// Step 4: Return success response with timing data
		return Response.json({
			success: true,
			productUrl: shopifyProductUrl,
			data: {
				originalImageUrl: r2ImageUrl,
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
					aiProcessing: parallelStart,
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
