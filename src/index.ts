import { handleCreateCharm } from './routes/createJewelryCharm';
// Keep as a named export so existing Wrangler "named entrypoint" dev configs (if any) don't break.
export { createShopifyProduct } from './services/shopify/createProduct';

function addCorsHeaders(response: Response): Response {
	response.headers.set('Access-Control-Allow-Origin', '*');
	response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
	return response;
}

function corsPreflight(): Response {
	return new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		},
	});
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log('🚀 Worker started - Request received:', request.method, request.url);
		const url = new URL(request.url);
		
		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return corsPreflight();
		}

		// Route handling
		if (request.method === 'POST' && url.pathname === '/api/create-jewelry-charm') {
			try {
				console.log('📝 Processing request body...');
			const response = await handleCreateCharm(request, env);
			
			// Add CORS headers to the response
			addCorsHeaders(response);
			
			return response;
			} catch (error) {
				console.error('❌ Error in request handler:', error);
				const errorResponse = addCorsHeaders(new Response(
					JSON.stringify({
						success: false,
						error: 'Request processing failed',
						details: error instanceof Error ? error.message : 'Unknown error'
					}),
					{ 
						status: 400,
						headers: { 
							'Content-Type': 'application/json',
						}
					}
				));
				return errorResponse;
			}
		}

		// Default route
		if (url.pathname === '/' || url.pathname === '/health') {
			return addCorsHeaders(Response.json({
				message: 'Jewelry API is running',
				environment: env.ENVIRONMENT,
				endpoints: {
					'POST /api/create-jewelry-charm': 'Create a custom jewelry charm from an image'
				},
				timestamp: new Date().toISOString()
			}));
		}

		// 404 for unmatched routes
		return addCorsHeaders(Response.json(
			{ error: 'Not found' },
			{ status: 404 }
		));
	},
} satisfies ExportedHandler<Env>;
