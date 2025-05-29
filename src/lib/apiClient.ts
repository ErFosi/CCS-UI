
// Client-side API client
import type { VideoAsset } from '@/lib/types';

// This function should be defined or imported if it's in a separate utility.
// For simplicity here, I'll define a basic version.
const getApiUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrl) {
    console.error("[API_CLIENT - BROWSER] Error: NEXT_PUBLIC_FASTAPI_URL is not defined in environment variables.");
    // Fallback or throw error, depending on desired behavior
    return "http://localhost:0/api_url_not_configured";
  }
  console.log(`[API_CLIENT - BROWSER] Using API Base URL: ${apiUrl}`);
  return apiUrl;
};


interface FetchOptions extends RequestInit {
  token?: string;
  responseType?: 'blob' | 'json'; // Added to specify expected response
}

async function fetchWithAuth<T = any>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const apiUrl = getApiUrl();
  const fullUrl = `${apiUrl}${path}`;
  const headers = new Headers(options.headers || {});

  if (options.token) {
    headers.append('Authorization', `Bearer ${options.token}`);
  }

  // Don't set Content-Type for FormData, browser does it.
  // For JSON, ensure it's set.
  if (!(options.body instanceof FormData) && options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase())) {
    if (!headers.has('Content-Type')) {
      headers.append('Content-Type', 'application/json');
    }
  }
  
  console.log(`[API_CLIENT - BROWSER] Making ${options.method || 'GET'} request to: ${fullUrl}`);
  
  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: any = {};
    let errorMessage = `Request failed with status ${response.status} ${response.statusText || '(Unknown Error)'}`;
    try {
      const responseText = await response.text(); // Read text first
      if (responseText) {
        errorData = JSON.parse(responseText); // Try to parse as JSON
        errorMessage = errorData?.detail || errorData?.message || errorMessage;
      }
    } catch (e) {
      console.warn(`[API_CLIENT - BROWSER] Could not parse error response as JSON for ${path}. Status: ${response.status}. Raw text: ${await response.text().catch(() => '')}`, e);
      // errorMessage remains the status text if JSON parsing fails
    }
    console.error(`[API_CLIENT - BROWSER] API Error ${response.status} for ${path}:`, errorData);
    throw new Error(errorMessage);
  }

  const contentType = response.headers.get("content-type");

  // Handle 204 No Content
  if (response.status === 204 || !contentType && options.responseType !== 'blob') { // If no content type but not expecting blob
    return undefined as T; 
  }

  // If responseType is explicitly 'blob', or content type suggests it's a file
  if (options.responseType === 'blob' || (contentType && (contentType.startsWith('video/') || contentType.startsWith('image/') || contentType === 'application/octet-stream'))) {
    return response.blob() as Promise<T>;
  }
  
  // Default to JSON if content type indicates it
  if (contentType && contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  
  // Fallback for other content types, try to parse as text
  console.warn(`[API_CLIENT - BROWSER] Unexpected content type: ${contentType} for path ${path}. Trying to parse as text.`);
  return response.text() as Promise<T>;
}


// API function to list video filenames.
// Your FastAPI backend returns a list of strings (filenames).
export async function listVideosApi(token: string): Promise<string[]> {
  console.log("[API_CLIENT - BROWSER] listVideosApi called");
  return fetchWithAuth<string[]>('/videos', { token, method: 'GET' });
}

// API function to upload a video. Expects FormData.
// The backend should return a VideoAsset-like object.
export async function uploadVideoApi(formData: FormData, token: string): Promise<VideoAsset> {
  console.log("[API_CLIENT - BROWSER] uploadVideoApi called");
  return fetchWithAuth<VideoAsset>('/upload', {
    method: 'POST',
    body: formData,
    token,
  });
}

// API function to get a specific video file as a Blob.
export async function getVideoApi(filename: string, token: string): Promise<Blob> {
  const apiPath = `/videos/${encodeURIComponent(filename)}`;
  console.log(`[API_CLIENT - BROWSER] getVideoApi called for filename: ${filename}`);
  return fetchWithAuth<Blob>(apiPath, {
    token,
    method: 'GET',
    responseType: 'blob', // Crucial: expect a Blob
  });
}

// API function to set a preference.
export async function setPreferenceApi(
  payload: { key: string; value: any },
  token: string
): Promise<void> { 
  console.log("[API_CLIENT - BROWSER] setPreferenceApi called with payload:", payload);
  await fetchWithAuth<void>('/preferences', { 
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  });
}
