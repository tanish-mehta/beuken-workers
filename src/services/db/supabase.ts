import { createClient } from '@supabase/supabase-js';

export function getSupabase(env: Env) {
	console.log('🔗 Connecting to Supabase...');
	return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false },
		global: { fetch },
	});
}

export async function saveGenerationRow(
	env: Env,
	params: {
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
	}
) {
	console.log('💾 Saving generation data to Supabase for product:', params.shopifyProductId);
	const supabase = getSupabase(env);

	const assets = [
		params.goldImageUrl && { role: 'gold', url: params.goldImageUrl },
		params.silverImageUrl && { role: 'silver', url: params.silverImageUrl },
		params.originalImageUrl && { role: 'original', url: params.originalImageUrl },
	].filter(Boolean);

	console.log('📊 Generation data:', {
		shopifyProductId: params.shopifyProductId,
		email: params.email,
		generationMethod: params.generationMethod,
		assetsCount: assets.length,
		publicGallery: params.publicGallery,
	});

	const { error } = await supabase.from('product_generation').upsert(
		{
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
		},
		{ onConflict: 'shopify_product_id' }
	);

	if (error) {
		console.error('❌ Supabase save failed:', error);
		throw error;
	}

	console.log('✅ Successfully saved generation data to Supabase');
}
