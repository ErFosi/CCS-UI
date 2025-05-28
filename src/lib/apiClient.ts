
// Client-side API client

import type { VideoAsset } from '@/lib/types';

const getApiUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrl) {
    console.error("[API_CLIENT - BROWSER] Error: NEXT_PUBLIC_FASTAPI_URL is not defined in environment variables.");
    return "http://localhost:0/api_url_not_configured"; 
  }
  console.log(`[API_CLIENT - BROWSER] Using API Base URL: ${apiUrl}`);
  return apiUrl;
};

interface FetchOptions extends RequestInit {
  token?: string;
  responseType?: 'blob' | 'json';
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
    let errorData: any = { detail: `Request failed with status ${response.status} ${response.statusText}` };
    let errorMessage = `Request failed with status ${response.status} ${response.statusText || 'Unknown error'}`;
    try {
      const responseText = await response.text(); 
      if (responseText) {
        errorData = JSON.parse(responseText); 
        errorMessage = errorData?.detail || errorData?.message || errorMessage;
      }
    } catch (e) {
      console.warn(`[API_CLIENT - BROWSER] Could not parse error response as JSON for ${path}. Status: ${response.status}. Raw text: ${await response.text().catch(() => '')}`, e);
    }
    console.error(`[API_CLIENT - BROWSER] API Error ${response.status} for ${path}:`, errorData);
    throw new Error(errorMessage); // Throw the more specific error message
  }

  const contentType = response.headers.get("content-type");

  if (response.status === 204 || !contentType) {
    return undefined as T; 
  }

  if (options.responseType === 'blob' || (contentType && (contentType.startsWith('video/') || contentType.startsWith('image/') || contentType === 'application/octet-stream'))) {
    return response.blob() as Promise<T>;
  }
  
  if (contentType && contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  
  console.warn(`[API_CLIENT - BROWSER] Unexpected content type: ${contentType} for path ${path}. Trying to parse as text.`);
  return response.text() as Promise<T>;
}

// Assuming your API returns a list of VideoAsset compatible objects
// Adjust the return type if your API returns something different that needs mapping
export async function listVideosApi(token: string): Promise<VideoAsset[]> {
  console.log("[API_CLIENT - BROWSER] listVideosApi called");
  return fetchWithAuth<VideoAsset[]>('/videos', { token, method: 'GET' });
}

// Assuming your API returns a VideoAsset compatible object upon successful upload
export async function uploadVideoApi(formData: FormData, token: string): Promise<VideoAsset> {
  console.log("[API_CLIENT - BROWSER] uploadVideoApi called");
  return fetchWithAuth<VideoAsset>('/upload', {
    method: 'POST',
    body: formData,
    token,
  });
}

// Modified to accept type if your API needs it, otherwise filename might be sufficient
// if your API determines original/censored based on different stored filenames or query params.
// This example assumes filename is enough, and the type is for client-side naming or if API uses it.
export async function getVideoApi(filename: string, token: string, type?: 'original' | 'censored'): Promise<Blob> {
  // If your API has different paths for original/censored, adjust 'path' here based on 'type'
  // For example: const path = type === 'censored' ? `/videos/censored/${filename}` : `/videos/original/${filename}`;
  // Or if it's a query parameter: const path = `/videos/${filename}?version=${type}`;
  // For now, assuming the base /videos/{filename} endpoint might serve the primary (original) version.
  // If type is needed by API, it needs to be incorporated into path or query.
  let apiPath = `/videos/${encodeURIComponent(filename)}`;
  if (type === 'censored') {
    // Example: if your API has a specific path segment for censored versions
    // apiPath = `/videos/censored/${encodeURIComponent(filename)}`; 
    // Or query param: apiPath = `/videos/${encodeURIComponent(filename)}?version=censored`;
    // This needs to match your FastAPI backend's routing for fetching specific versions.
    // For now, we assume getVideoApi is for the file named 'filename' and differentiation is elsewhere
    // or that filename itself implies original/censored.
    // Let's assume the download logic in VideoContext/VideoCard will handle this.
    // The API call itself will just use the filename it's given.
  }
  console.log(`[API_CLIENT - BROWSER] getVideoApi called for filename: ${filename}, type: ${type}`);
  return fetchWithAuth<Blob>(apiPath, {
    token,
    method: 'GET',
    responseType: 'blob',
  });
}

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
