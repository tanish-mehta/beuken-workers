import * as JPEG from 'jpeg-js';
import UPNG from 'upng-js';
import { arrayBufferToBase64 } from '../../utils/base64';

// Bilinear interpolation resize helper
export function bilinearResize(srcData: Uint8ClampedArray, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): Uint8ClampedArray {
	const dstData = new Uint8ClampedArray(dstWidth * dstHeight * 4);
	const xRatio = srcWidth / dstWidth;
	const yRatio = srcHeight / dstHeight;
	
	for (let dstY = 0; dstY < dstHeight; dstY++) {
		for (let dstX = 0; dstX < dstWidth; dstX++) {
			const srcX = dstX * xRatio;
			const srcY = dstY * yRatio;
			
			const srcX0 = Math.floor(srcX);
			const srcY0 = Math.floor(srcY);
			const srcX1 = Math.min(srcX0 + 1, srcWidth - 1);
			const srcY1 = Math.min(srcY0 + 1, srcHeight - 1);
			
			const xWeight = srcX - srcX0;
			const yWeight = srcY - srcY0;
			
			const dstIdx = (dstY * dstWidth + dstX) * 4;
			
			for (let c = 0; c < 4; c++) {
				const tl = srcData[(srcY0 * srcWidth + srcX0) * 4 + c];
				const tr = srcData[(srcY0 * srcWidth + srcX1) * 4 + c];
				const bl = srcData[(srcY1 * srcWidth + srcX0) * 4 + c];
				const br = srcData[(srcY1 * srcWidth + srcX1) * 4 + c];
				
				const top = tl + (tr - tl) * xWeight;
				const bottom = bl + (br - bl) * xWeight;
				dstData[dstIdx + c] = top + (bottom - top) * yWeight;
			}
		}
	}
	
	return dstData;
}

// Local fallback: resize to 1024x1024 with padding and convert to grayscale.
// This is used only when Cloudflare URL transformations cannot fetch the source image
// (e.g., when running `wrangler dev` with local R2 buckets).
export async function resizeAndGrayscaleTo1024(buffer: ArrayBuffer, imageType: string): Promise<string> {
	console.log('🖼️ Resizing image to 1024x1024 and converting to grayscale (local fallback)...');
	const startTime = Date.now();

	try {
		const uint8Array = new Uint8Array(buffer);
		let imageData: { data: Uint8ClampedArray; width: number; height: number };

		// Decode based on image type
		if (imageType.includes('png')) {
			const png = UPNG.decode(uint8Array.buffer);
			const rgba = UPNG.toRGBA8(png)[0];
			imageData = {
				data: new Uint8ClampedArray(rgba),
				width: png.width,
				height: png.height
			};
		} else {
			const decoded = JPEG.decode(uint8Array, { useTArray: true });
			imageData = {
				data: new Uint8ClampedArray(decoded.data.buffer),
				width: decoded.width,
				height: decoded.height
			};
		}

		const targetSize = 1024;
		const aspectRatio = imageData.width / imageData.height;

		let scaledWidth: number;
		let scaledHeight: number;

		if (imageData.width > imageData.height) {
			scaledWidth = targetSize;
			scaledHeight = Math.round(targetSize / aspectRatio);
		} else {
			scaledHeight = targetSize;
			scaledWidth = Math.round(targetSize * aspectRatio);
		}

		// Resize to scaled dimensions
		const resizedData = bilinearResize(
			imageData.data,
			imageData.width,
			imageData.height,
			scaledWidth,
			scaledHeight
		);

		// Create padded canvas (white background)
		const finalData = new Uint8ClampedArray(targetSize * targetSize * 4);
		for (let i = 0; i < finalData.length; i += 4) {
			finalData[i] = 255;
			finalData[i + 1] = 255;
			finalData[i + 2] = 255;
			finalData[i + 3] = 255;
		}

		const offsetX = Math.floor((targetSize - scaledWidth) / 2);
		const offsetY = Math.floor((targetSize - scaledHeight) / 2);

		for (let y = 0; y < scaledHeight; y++) {
			for (let x = 0; x < scaledWidth; x++) {
				const srcIdx = (y * scaledWidth + x) * 4;
				const dstIdx = ((y + offsetY) * targetSize + (x + offsetX)) * 4;

				finalData[dstIdx] = resizedData[srcIdx];
				finalData[dstIdx + 1] = resizedData[srcIdx + 1];
				finalData[dstIdx + 2] = resizedData[srcIdx + 2];
				finalData[dstIdx + 3] = resizedData[srcIdx + 3];
			}
		}

		// Convert to grayscale in-place (preserves alpha)
		for (let i = 0; i < finalData.length; i += 4) {
			const r = finalData[i];
			const g = finalData[i + 1];
			const b = finalData[i + 2];
			// ITU-R BT.601 luma approximation
			const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
			finalData[i] = y;
			finalData[i + 1] = y;
			finalData[i + 2] = y;
		}

		// Encode to JPEG
		const encoded = JPEG.encode({
			data: finalData,
			width: targetSize,
			height: targetSize
		}, 95);

		const base64 = arrayBufferToBase64(encoded.data.buffer as ArrayBuffer);
		console.log(`⏱️ Local grayscale+resize took: ${Date.now() - startTime}ms`);
		return base64;
	} catch (error) {
		console.error('❌ Error in local grayscale+resize fallback:', error);
		// Absolute fallback: just return original as base64 (no resize)
		return arrayBufferToBase64(buffer);
	}
}


