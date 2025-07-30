# Shopify App Configuration Guide

## App Settings

### Basic Information

- **App Name**: Custom Jewelry Charm Generator
- **App URL**: `https://your-worker.your-subdomain.workers.dev`
- **Allowed Redirection URL(s)**:
  - `https://your-worker.your-subdomain.workers.dev/auth/callback`
  - `https://your-worker.your-subdomain.workers.dev/`

### App Setup

#### 1. Admin API Integration

**Required Scopes:**

- `write_products` - Create jewelry charm products
- `write_product_listings` - Manage product visibility
- `read_inventory` - Check stock levels
- `write_inventory` - Update inventory quantities
- `read_orders` - Read order information (optional)
- `write_orders` - Create orders (if needed)

#### 2. API Credentials

After setting up your app, you'll get:

- **API Key**: Used for OAuth (if building public app)
- **API Secret**: Used for OAuth (if building public app)
- **Access Token**: Used for API calls (private app)

#### 3. Webhook Configuration (Optional)

If you want to track order status or inventory changes:

- **Webhook URL**: `https://your-worker.your-subdomain.workers.dev/webhooks/shopify`
- **Events to Subscribe**:
  - `orders/create` - New orders
  - `orders/updated` - Order status changes
  - `products/update` - Product changes

## Environment Variables Setup

Update your `wrangler.toml` with your Shopify store information:

```toml
[env.development.vars]
SHOPIFY_STORE_URL = "https://your-store-name.myshopify.com"
# Add as secret: SHOPIFY_ACCESS_TOKEN = "shpat_xxxxx"

[env.staging.vars]
SHOPIFY_STORE_URL = "https://your-staging-store.myshopify.com"
# Add as secret: SHOPIFY_ACCESS_TOKEN = "shpat_xxxxx"

[env.production.vars]
SHOPIFY_STORE_URL = "https://your-production-store.myshopify.com"
# Add as secret: SHOPIFY_ACCESS_TOKEN = "shpat_xxxxx"
```

## Setting Up Secrets

```bash
# Development
wrangler secret put SHOPIFY_ACCESS_TOKEN --env development
# Enter your private app access token when prompted

# Staging
wrangler secret put SHOPIFY_ACCESS_TOKEN --env staging

# Production
wrangler secret put SHOPIFY_ACCESS_TOKEN --env production
```

## Testing Your Integration

### 1. Test Product Creation

```bash
curl -X POST \
  -F "image=@test-image.jpg" \
  -F "email=test@example.com" \
  -F "publicGallery=true" \
  https://your-worker.your-subdomain.workers.dev/api/create-jewelry-charm
```

### 2. Verify in Shopify Admin

1. Go to Products in your Shopify admin
2. Look for newly created "Custom Jewelry Charm" products
3. Check that all 4 images are uploaded
4. Verify silver and gold variants exist
5. Confirm product description includes the story

## Troubleshooting

### Common Issues:

**403 Forbidden Error:**

- Check that your access token has the required scopes
- Verify the store URL is correct (should include .myshopify.com)

**422 Unprocessable Entity:**

- Product data validation failed
- Check image URLs are accessible
- Verify required fields are not empty

**Rate Limiting:**

- Shopify has API rate limits (40 requests/second for Plus, 2/second for others)
- Implement retry logic with exponential backoff

### Debug Steps:

1. Check Cloudflare Workers logs for detailed error messages
2. Test API credentials with a simple product creation in Shopify admin
3. Verify all external image URLs are publicly accessible
4. Test with smaller images if upload fails

## Next Steps

1. **Configure your app in Shopify Partner Dashboard**
2. **Set up the required API scopes**
3. **Get your access token and add it as a secret**
4. **Update your store URL in wrangler.toml**
5. **Deploy and test the integration**
