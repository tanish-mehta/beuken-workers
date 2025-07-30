/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

interface CreateCharmRequest {
	image: File;
	email: string;
	publicGallery: boolean;
	story?: string;
	inspiration?: string;
}

// Helper function to convert File to base64
async function fileToBase64(file: File): Promise<string> {
	const arrayBuffer = await file.arrayBuffer();
	const bytes = new Uint8Array(arrayBuffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

// Helper function to upload image to a temporary storage (using a data URL for now)
async function uploadImageToStorage(imageBuffer: ArrayBuffer, filename: string): Promise<string> {
	// In a real implementation, you would upload to Supabase or another storage service
	// For now, we'll return a mock URL
	return `https://storage.example.com/uploads/${filename}`;
}

// OpenAI Vision API integration
async function generateStoryWithOpenAI(imageBase64: string, env: Env): Promise<string> {
	console.log('OpenAI API Key exists:', !!env.OPENAI_API_KEY);
	console.log('OpenAI API Key first 10 chars:', env.OPENAI_API_KEY?.substring(0, 10));
	console.log('OpenAI API Key last 10 chars:', env.OPENAI_API_KEY?.substring(env.OPENAI_API_KEY.length - 10));
	
	const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: 'gpt-4o',
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: 'Create a 3-4 sentence story for this image that is being turned into a charm. Make it meaningful and personal.'
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
			max_tokens: 150
		})
	});

	if (!openAIResponse.ok) {
		const errorBody = await openAIResponse.text();
		console.error('OpenAI API Error Details:', {
			status: openAIResponse.status,
			statusText: openAIResponse.statusText,
			body: errorBody
		});
		throw new Error(`OpenAI API error: ${openAIResponse.status} - ${errorBody}`);
	}

	const result = await openAIResponse.json() as any;
	return result.choices[0].message.content;
}

// Fal LoRA API integration for silver image
async function generateSilverImage(imageBase64: string, env: Env): Promise<string> {
	console.log('Fal API Key exists:', !!env.FAL_API_KEY);
	console.log('Calling Fal Flux Kontext LoRA API...');
	
	const falResponse = await fetch('https://fal.run/fal-ai/flux-kontext-lora', {
		method: 'POST',
		headers: {
			'Authorization': `Key ${env.FAL_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			image_url: `data:image/jpeg;base64,${imageBase64}`,
			prompt: 'Convert input photos into highly detailed silver pendant charms with a realistic 3D metallic embossed style, preserving likeness and fine features.',
			num_inference_steps: 40,
			guidance_scale: 2.5,
			num_images: 1,
			output_format: 'png',
			resolution_mode: 'match_input',
			loras: [{
				path: 'https://v3.fal.media/files/koala/6BA9zqC6v0YIbZXy-5fb7_adapter_model.safetensors',
				scale: 1.0
			}]
		})
	});

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
	console.log('Fal LoRA API Response:', result);
	return result.images[0].url;
}

// Fal Flux Kontext API integration for gold image
async function generateGoldImage(silverImageUrl: string, env: Env): Promise<string> {
	console.log('Calling Fal Flux Kontext API for gold version...');
	
	const falResponse = await fetch('https://fal.run/fal-ai/flux-pro/kontext/max', {
		method: 'POST',
		headers: {
			'Authorization': `Key ${env.FAL_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			image_url: silverImageUrl,
			prompt: 'Convert the object in this image into a polished gold version. Maintain the exact shape, proportions, and details of the original object. Render it as shiny metallic gold with realistic reflections, highlights, and shadows. Ensure the gold looks like 24k jewelry-quality metal — smooth, glossy, and professional. Keep the background and composition unchanged.',
			num_inference_steps: 40,
			guidance_scale: 2.5,
			num_images: 1,
			output_format: 'png',
			resolution_mode: 'match_input'
		})
	});

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
	console.log('Fal Flux Kontext Max API Response:', result);
	return result.images[0].url;
}

// Shopify product creation
async function createShopifyProduct(
	originalImageUrl: string,
	silverImageUrl: string,
	goldImageUrl: string,
	story: string,
	email: string,
	env: Env
): Promise<string> {
	const sizeReferenceImageUrl = 'https://example.com/size-reference.jpg'; // Same URL for every product
	
	// Use proper Shopify Admin API endpoint format
	console.log('Shopify Store URL:', env.SHOPIFY_STORE_URL);
	console.log('Shopify Access Token exists:', !!env.SHOPIFY_ACCESS_TOKEN);
	console.log('Shopify Access Token format:', env.SHOPIFY_ACCESS_TOKEN?.substring(0, 6) + '...' + env.SHOPIFY_ACCESS_TOKEN?.substring(env.SHOPIFY_ACCESS_TOKEN.length - 6));
	
	// First test the connection with a simple GET request
	console.log('Testing Shopify API connection...');
	const testResponse = await fetch(`${env.SHOPIFY_STORE_URL}/admin/api/2024-07/shop.json`, {
		method: 'GET',
		headers: {
			'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
			'Content-Type': 'application/json',
		}
	});
	
	if (!testResponse.ok) {
		const testError = await testResponse.text();
		console.error('Shopify API Connection Test Failed:', {
			status: testResponse.status,
			body: testError
		});
		throw new Error(`Shopify API connection failed: ${testResponse.status} - ${testError}`);
	} else {
		console.log('Shopify API connection successful!');
	}
	
	const shopifyResponse = await fetch(`${env.SHOPIFY_STORE_URL}/admin/api/2024-07/products.json`, {
		method: 'POST',
		headers: {
			'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			product: {
				title: `Custom Jewelry Charm - ${new Date().toISOString().split('T')[0]}`,
				body_html: `<div class="custom-charm-description">
					<h3>Your Personal Story</h3>
					<p>${story}</p>
					<br/>
					<p><strong>Customer:</strong> ${email}</p>
					<p><strong>Created:</strong> ${new Date().toLocaleDateString()}</p>
				</div>`,
				vendor: 'Custom Jewelry Co.',
				product_type: 'Jewelry Charm',
				tags: ['custom', 'charm', 'jewelry', 'personalized', 'ai-generated'],
				status: 'active',
				published: true,
				images: [
					{ 
						src: originalImageUrl, 
						alt: 'Original Inspiration Image',
						position: 1
					},
					{ 
						src: silverImageUrl, 
						alt: 'Silver Charm Version',
						position: 2
					},
					{ 
						src: goldImageUrl, 
						alt: 'Gold Charm Version',
						position: 3
					},
					{ 
						src: sizeReferenceImageUrl, 
						alt: 'Size Reference',
						position: 4
					}
				],
				variants: [
					{
						title: 'Silver',
						price: '99.99',
						sku: `CHARM-SILVER-${Date.now()}`,
						inventory_quantity: 1,
						inventory_management: 'shopify',
						inventory_policy: 'deny',
						fulfillment_service: 'manual',
						weight: 0.1,
						weight_unit: 'oz',
						requires_shipping: true,
						taxable: true
					},
					{
						title: 'Gold',
						price: '199.99',
						sku: `CHARM-GOLD-${Date.now()}`,
						inventory_quantity: 1,
						inventory_management: 'shopify',
						inventory_policy: 'deny',
						fulfillment_service: 'manual',
						weight: 0.15,
						weight_unit: 'oz',
						requires_shipping: true,
						taxable: true
					}
				],
				options: [
					{
						name: 'Material',
						values: ['Silver', 'Gold']
					}
				]
			}
		})
	});

	if (!shopifyResponse.ok) {
		const errorBody = await shopifyResponse.text();
		console.error('Shopify API Error Details:', {
			status: shopifyResponse.status,
			statusText: shopifyResponse.statusText,
			url: `${env.SHOPIFY_STORE_URL}/admin/api/2023-10/products.json`,
			body: errorBody,
			headers: Object.fromEntries(shopifyResponse.headers.entries())
		});
		throw new Error(`Shopify API error: ${shopifyResponse.status} - ${errorBody}`);
	}

	const result = await shopifyResponse.json() as any;
	return `${env.SHOPIFY_STORE_URL.replace('/admin', '')}/products/${result.product.handle}`;
}

async function handleCreateCharm(request: Request, env: Env): Promise<Response> {
	try {
		// Parse the form data
		const formData = await request.formData();
		
		const image = formData.get('image') as File;
		const email = formData.get('email') as string;
		const publicGallery = formData.get('publicGallery') === 'true';
		const story = formData.get('story') as string || '';
		const inspiration = formData.get('inspiration') as string || '';

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

		console.log(`Processing request in ${env.ENVIRONMENT} environment for ${email}`);

		// Step 1: Convert image to base64 for AI processing
		const imageBase64 = await fileToBase64(image);
		const originalImageBuffer = await image.arrayBuffer();
		const originalImageUrl = await uploadImageToStorage(originalImageBuffer, `original-${Date.now()}.jpg`);

		// Step 2: Generate story with OpenAI Vision API (if no story provided)
		let generatedStory = story;
		if (!story) {
			console.log('Generating story with OpenAI Vision API...');
			generatedStory = await generateStoryWithOpenAI(imageBase64, env);
		}

		// Step 3: Generate silver image using Fal LoRA
		console.log('Generating silver image with Fal LoRA...');
		const silverImageUrl = await generateSilverImage(imageBase64, env);

		// Step 4: Generate gold image using Fal Flux Kontext Max
		console.log('Generating gold image with Fal Flux Kontext Max...');
		const goldImageUrl = await generateGoldImage(silverImageUrl, env);

		// Step 5: Create Shopify product
		console.log('Creating Shopify product...');
		const shopifyProductUrl = await createShopifyProduct(
			originalImageUrl,
			silverImageUrl,
			goldImageUrl,
			generatedStory,
			email,
			env
		);

		// Step 6: Return success response with product URL
		return Response.json({
			success: true,
			productUrl: shopifyProductUrl,
			data: {
				originalImageUrl,
				silverImageUrl,
				goldImageUrl,
				story: generatedStory,
				inspiration,
				email,
				publicGallery,
				timestamp: new Date().toISOString()
			}
		});

	} catch (error) {
		console.error('Error processing charm creation:', error);
		return Response.json(
			{ 
				success: false, 
				error: 'Internal server error',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
			const response = await handleCreateCharm(request, env);
			
			// Add CORS headers to the response
			response.headers.set('Access-Control-Allow-Origin', '*');
			response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
			
			return response;
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
