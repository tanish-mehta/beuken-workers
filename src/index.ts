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
	inspiration?: string;
}

async function handleCreateCharm(request: Request, env: Env): Promise<Response> {
	try {
		// Parse the form data
		const formData = await request.formData();
		
		const image = formData.get('image') as File;
		const email = formData.get('email') as string;
		const publicGallery = formData.get('publicGallery') === 'true';
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

		// Get environment-specific URLs
		const isProduction = env.ENVIRONMENT === 'production';
		const aiGenerationUrl = env.AI_GENERATION_URL;
		const supabaseUrl = env.SUPABASE_URL;
		const shopifyStoreUrl = env.SHOPIFY_STORE_URL;

		console.log(`Processing request in ${env.ENVIRONMENT} environment`);

		// TODO: Implement actual logic:
		// 1. Send image to AI generation backend
		// const aiResponse = await fetch(aiGenerationUrl, { ... });
		
		// 2. Upload original and generated image to Supabase
		// const originalImageUrl = await uploadToSupabase(imageBuffer, supabaseUrl);
		
		// 3. Save metadata to DB
		// await saveMetadataToDB({ ... });
		
		// 4. Create Shopify product
		// const shopifyResponse = await fetch(`${shopifyStoreUrl}/admin/api/...`, { ... });
		
		// For now, return a stubbed response with environment-specific URLs
		const mockProductUrl = `${shopifyStoreUrl}/products/custom-charm-${Date.now()}`;
		
		// Different processing time based on environment
		const processingTime = isProduction ? 2000 : 500;
		await new Promise(resolve => setTimeout(resolve, processingTime));

		return Response.json({
			success: true,
			productUrl: mockProductUrl,
			// Additional mock data for development
			debug: {
				environment: env.ENVIRONMENT,
				receivedEmail: email,
				publicGallery: publicGallery,
				inspiration: inspiration,
				imageSize: image.size,
				imageType: image.type,
				timestamp: new Date().toISOString(),
				urls: {
					aiGeneration: aiGenerationUrl,
					supabase: supabaseUrl,
					shopifyStore: shopifyStoreUrl
				}
			}
		});

	} catch (error) {
		console.error('Error processing charm creation:', error);
		return Response.json(
			{ 
				success: false, 
				error: 'Internal server error' 
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
