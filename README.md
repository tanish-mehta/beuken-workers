# Jewelry Charm Creation API

A Cloudflare Workers API that transforms images into custom jewelry charms using AI-powered image generation and creates Shopify products automatically.

## Features

- **Image Processing**: Accepts uploaded images and processes them for jewelry creation
- **AI Story Generation**: Uses OpenAI Vision API to create meaningful stories for each charm
- **Silver & Gold Variants**: Generates both silver and gold versions using Fal AI APIs
- **Shopify Integration**: Automatically creates products with all images and metadata
- **Multi-Environment**: Supports development, staging, and production environments

## API Flow

1. **Upload Image**: User uploads an image with email and preferences
2. **Story Generation**: OpenAI Vision API creates a 3-4 sentence story (if not provided)
3. **Silver Generation**: Fal LoRA API converts image to polished silver version
4. **Gold Generation**: Fal Flux Kontext Max API converts silver to gold version
5. **Product Creation**: Shopify product is created with all images and story
6. **Response**: Returns Shopify product URL to user

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare Workers account
- OpenAI API key
- Fal AI API key
- Shopify store with API access

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd jewelry-api
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment secrets:

For development:

```bash
wrangler secret put OPENAI_API_KEY --env development
wrangler secret put FAL_API_KEY --env development
wrangler secret put SHOPIFY_ACCESS_TOKEN --env development
```

For staging:

```bash
wrangler secret put OPENAI_API_KEY --env staging
wrangler secret put FAL_API_KEY --env staging
wrangler secret put SHOPIFY_ACCESS_TOKEN --env staging
```

For production:

```bash
wrangler secret put OPENAI_API_KEY --env production
wrangler secret put FAL_API_KEY --env production
wrangler secret put SHOPIFY_ACCESS_TOKEN --env production
```

4. Update `wrangler.toml` with your actual URLs:
   - Replace Supabase URLs with your project URLs
   - Replace Shopify store URLs with your store URLs

## API Endpoints

### POST /api/create-jewelry-charm

Creates a custom jewelry charm from an uploaded image.

**Request:**

- Content-Type: `multipart/form-data`

**Form Fields:**

- `image` (File, required): The image to convert into a charm
- `email` (string, required): Customer email address
- `publicGallery` (boolean): Whether to include in public gallery
- `story` (string, optional): Custom story for the charm (if not provided, AI generates one)
- `inspiration` (string, optional): Additional inspiration text

**Response:**

```json
{
	"success": true,
	"productUrl": "https://yourstore.myshopify.com/products/custom-charm-123",
	"data": {
		"originalImageUrl": "https://storage.example.com/uploads/original-123.jpg",
		"silverImageUrl": "https://fal.ai/generated/silver-123.jpg",
		"goldImageUrl": "https://fal.ai/generated/gold-123.jpg",
		"story": "Generated or provided story text...",
		"inspiration": "Optional inspiration text",
		"email": "customer@example.com",
		"publicGallery": true,
		"timestamp": "2024-01-25T10:30:00.000Z"
	}
}
```

**Error Response:**

```json
{
	"success": false,
	"error": "Error message",
	"details": "Detailed error information"
}
```

### GET /

Health check endpoint that returns API status and available endpoints.

**Response:**

```json
{
	"message": "Jewelry API is running",
	"environment": "development",
	"endpoints": {
		"POST /api/create-jewelry-charm": "Create a custom jewelry charm from an image"
	},
	"timestamp": "2024-01-25T10:30:00.000Z"
}
```

## Development

### Local Development

Start the development server:

```bash
npm run dev
```

The API will be available at `http://localhost:8787`

### Testing

Run tests:

```bash
npm test
```

### Deployment

Deploy to staging:

```bash
npm run deploy:staging
```

Deploy to production:

```bash
npm run deploy:production
```

## API Integration Examples

### JavaScript/Fetch

```javascript
const formData = new FormData();
formData.append('image', imageFile);
formData.append('email', 'customer@example.com');
formData.append('publicGallery', 'true');
formData.append('story', 'Optional custom story');

const response = await fetch('/api/create-jewelry-charm', {
	method: 'POST',
	body: formData,
});

const result = await response.json();
if (result.success) {
	console.log('Product created:', result.productUrl);
} else {
	console.error('Error:', result.error);
}
```

### cURL

```bash
curl -X POST \
  -F "image=@/path/to/image.jpg" \
  -F "email=customer@example.com" \
  -F "publicGallery=true" \
  -F "story=This charm represents my favorite memory" \
  https://your-worker.your-subdomain.workers.dev/api/create-jewelry-charm
```

## Environment Variables

### Development

- `ENVIRONMENT`: "development"
- `AI_GENERATION_URL`: Development AI service URL
- `SUPABASE_URL`: Development Supabase project URL
- `SHOPIFY_STORE_URL`: Development Shopify store URL

### Staging

- `ENVIRONMENT`: "staging"
- `AI_GENERATION_URL`: Staging AI service URL
- `SUPABASE_URL`: Staging Supabase project URL
- `SHOPIFY_STORE_URL`: Staging Shopify store URL

### Production

- `ENVIRONMENT`: "production"
- `AI_GENERATION_URL`: Production AI service URL
- `SUPABASE_URL`: Production Supabase project URL
- `SHOPIFY_STORE_URL`: Production Shopify store URL

### Secrets (All Environments)

- `OPENAI_API_KEY`: OpenAI API key for story generation
- `FAL_API_KEY`: Fal AI API key for image generation
- `SHOPIFY_ACCESS_TOKEN`: Shopify private app access token

## AI Service Configuration

### OpenAI Vision API

- Model: `gpt-4-vision-preview`
- Purpose: Generate meaningful stories from uploaded images
- Max tokens: 150

### Fal LoRA API

- Endpoint: `https://fal.run/fal-ai/flux-lora`
- LoRA Model: `https://v3.fal.media/files/koala/6BA9zqC6v0YIbZXy-5fb7_adapter_model.safetensors`
- Purpose: Convert images to silver jewelry versions

### Fal Flux Kontext Max API

- Endpoint: `https://fal.run/fal-ai/flux-kontext-max`
- Purpose: Convert silver images to gold versions

## Shopify Integration

The API creates Shopify products with:

- Title: "Custom Jewelry Charm - YYYY-MM-DD"
- Description: Generated story + customer email
- Product type: "Jewelry Charm"
- Tags: custom, charm, jewelry, personalized
- Images: Original, Silver, Gold, Size Reference
- Variants: Silver ($99.99), Gold ($199.99)

## Error Handling

The API handles various error scenarios:

- Missing required fields (400 Bad Request)
- API service failures (500 Internal Server Error)
- Invalid image formats
- Network timeouts
- Authentication errors

## CORS Support

The API includes CORS headers to support browser-based requests:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Security Considerations

- API keys are stored as Cloudflare secrets
- File uploads are validated
- Rate limiting should be implemented for production use
- Consider adding authentication for sensitive operations

## Support

For issues and questions:

1. Check the error response details
2. Verify all API keys are properly configured
3. Ensure all external services (OpenAI, Fal AI, Shopify) are accessible
4. Review Cloudflare Workers logs for detailed error information
