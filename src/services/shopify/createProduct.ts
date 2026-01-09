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


