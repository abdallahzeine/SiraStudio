import { extractDomain } from './linkValidation';

export interface FaviconResult {
  url: string | null;
  error: string | null;
  isLoading: boolean;
}

// Cache for favicon results to avoid repeated requests
const faviconCache = new Map<string, string>();

/**
 * Attempts to fetch a favicon for a given URL
 * Uses Google's favicon service as a fallback
 */
export const fetchFavicon = async (url: string): Promise<FaviconResult> => {
  if (!url) {
    return { url: null, error: 'No URL provided', isLoading: false };
  }

  const domain = extractDomain(url);
  
  // Check cache first
  if (faviconCache.has(domain)) {
    return { url: faviconCache.get(domain)!, error: null, isLoading: false };
  }

  try {
    // Try Google's favicon service (most reliable)
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
    
    // Verify the favicon exists by attempting to load it
    const exists = await checkImageExists(googleFaviconUrl);
    
    if (exists) {
      faviconCache.set(domain, googleFaviconUrl);
      return { url: googleFaviconUrl, error: null, isLoading: false };
    }

    // Fallback: try direct favicon.ico
    const directFaviconUrl = `https://${domain}/favicon.ico`;
    const directExists = await checkImageExists(directFaviconUrl);
    
    if (directExists) {
      faviconCache.set(domain, directFaviconUrl);
      return { url: directFaviconUrl, error: null, isLoading: false };
    }

    return { url: null, error: 'No favicon found', isLoading: false };
  } catch {
    return { url: null, error: 'Failed to fetch favicon', isLoading: false };
  }
};

/**
 * Checks if an image URL is valid and loadable
 */
const checkImageExists = (url: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
    
    // Timeout after 3 seconds
    setTimeout(() => resolve(false), 3000);
  });
};

