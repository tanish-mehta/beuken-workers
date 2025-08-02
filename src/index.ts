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

// Groq API integration for product name and story generation
async function generateProductNameAndStory(imageBase64: string, env: Env): Promise<{ productName: string; story: string }> {
	console.log('Generating product name and story with Groq...');
	console.log('Groq API Key exists:', !!env.GROQ_API_KEY);
	console.log('Groq API Key length:', env.GROQ_API_KEY ? env.GROQ_API_KEY.length : 0);
	console.log('Groq API Key starts with:', env.GROQ_API_KEY ? env.GROQ_API_KEY.substring(0, 10) + '...' : 'undefined');
	
	const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.GROQ_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: 'meta-llama/llama-4-scout-17b-16e-instruct',
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: `Analyze this image and provide:
1. A short, catchy product name (maximum 3 words) for this jewelry charm
2. A compelling 2-3 sentence product description that makes this jewelry piece sound beautiful and desirable

Return ONLY a valid JSON object with no markdown formatting, no code blocks, and no additional text:
{
  "productName": "Your Product Name",
  "story": "Your product description here..."
}

Make the product name descriptive and appealing for a jewelry store (examples: "Golden Memory", "Silver Dreams", "Athletic Spirit"). The description should highlight the beauty, craftsmanship, and appeal of the jewelry piece itself, not tell a personal story.`
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

	if (!groqResponse.ok) {
		const errorBody = await groqResponse.text();
		console.error('Groq API Error Details:', {
			status: groqResponse.status,
			statusText: groqResponse.statusText,
			body: errorBody
		});
		// Fallback values if API fails
		return {
			productName: 'Custom Charm',
			story: 'A beautiful memory captured in a charm, ready to be treasured forever.'
		};
	}

	const result = await groqResponse.json() as any;
	const content = result.choices[0].message.content;
	
	try {
		// Parse JSON response
		const parsed = JSON.parse(content);
		return {
			productName: parsed.productName || 'Custom Charm',
			story: parsed.story || 'A beautiful memory captured in a charm, ready to be treasured forever.'
		};
	} catch (parseError) {
		console.error('Failed to parse Groq response as JSON:', content);
		// Fallback values if parsing fails
		return {
			productName: 'Custom Charm',
			story: 'A beautiful memory captured in a charm, ready to be treasured forever.'
		};
	}
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
			width: 1024,
			height: 1024,
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
			width: 1024,
			height: 1024
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
  env: { SHOPIFY_STORE_URL: string; SHOPIFY_ACCESS_TOKEN: string }
): Promise<string> {
  const sizeReferenceImageUrl = "https://example.com/size-reference.jpg";

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

  // Create the product
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
        { src: originalImageUrl, alt: "Original Inspiration Image", position: 1 },
        { src: silverImageUrl, alt: "Silver Charm Version", position: 2 },
        { src: goldImageUrl, alt: "Gold Charm Version", position: 3 },
        { src: sizeReferenceImageUrl, alt: "Size Reference", position: 4 },
      ],
      variants: [
        {
          option1: "14K Gold",
			  price: "299.99",
		  compare_at_price: "399.99", 
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
          option1: "Sterling Silver",
			 price: "99.99",
		  compare_at_price: "149.99",
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
          option1: "Gold Vermeil",
			  price: "149.99",
		  compare_at_price: "199.99",
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

  const { product } = response as { product: { handle: string } };

  // 3. Return product URL
  return `${env.SHOPIFY_STORE_URL.replace("/admin", "")}/products/${product.handle}`;
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

		// Step 2: Start parallel processing for independent operations
		console.log('Starting parallel processing...');
		
		const [nameAndStory, silverImageUrl] = await Promise.all([
			// Generate product name and story in single Groq API call (if no story provided)
			story ? 
				Promise.resolve({ productName: 'Custom Charm', story }) : 
				generateProductNameAndStory(imageBase64, env),
			// Generate silver image using Fal LoRA
			generateSilverImage(imageBase64, env)
		]);

		console.log('Parallel processing completed. Generated:', {
			productName: nameAndStory.productName,
			storyLength: nameAndStory.story.length,
			silverImageGenerated: !!silverImageUrl
		});

		// Step 3: Generate gold image (depends on silver image)
		console.log('Generating gold image with Fal Flux Kontext Max...');
		const goldImageUrl = await generateGoldImage(silverImageUrl, env);

		// Step 4: Create Shopify product with all generated data
		console.log('Creating Shopify product...');
		const shopifyProductUrl = await createShopifyProduct(
			originalImageUrl,
			silverImageUrl,
			goldImageUrl,
			nameAndStory.story,
			nameAndStory.productName,
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
				story: nameAndStory.story,
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
