// Retry helper function
export async function retryWithBackoff<T>(operation: () => Promise<T>, maxRetries: number = 2, baseDelay: number = 1000): Promise<T> {
	let lastError: Error;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;

			if (attempt === maxRetries) {
				throw lastError;
			}

			const delay = baseDelay * Math.pow(2, attempt);
			console.log(`⏳ Retry attempt ${attempt + 1}/${maxRetries + 1} in ${delay}ms...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError!;
}
