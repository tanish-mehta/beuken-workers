// Helper function to upload image to Cloudflare R2 storage
export async function uploadImageToR2(
	imageBuffer: ArrayBuffer,
	filename: string,
	productId: string,
	env: Env,
	options?: {
		contentType?: string;
		typeMetadata?: string;
	}
): Promise<string> {
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
				contentType: options?.contentType || 'application/octet-stream',
			},
			customMetadata: {
				productId: productId,
				uploadedAt: new Date().toISOString(),
				type: options?.typeMetadata || 'image',
			},
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
