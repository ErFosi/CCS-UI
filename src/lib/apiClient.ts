
// REMOVED: 'use server'; - This module will now be client-side.

import type { VideoAsset } from '@/lib/types';
// Removed https and node-fetch imports as they are for server-side.

const getApiUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrl) {
    console.error("Error: NEXT_PUBLIC_FASTAPI_URL is not defined in environment variables.");
    throw new Error("API URL is not configured.");
  }
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

  // Do not set Content-Type for FormData; the browser will do it with the correct boundary.
  if (!(options.body instanceof FormData) && typeof options.body === 'string') {
     if (!headers.has('Content-Type') && options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase())) {
        headers.append('Content-Type', 'application/json');
     }
  }

  console.log(`[API_CLIENT - BROWSER] Making ${options.method || 'GET'} request to: ${fullUrl}`);
  
  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      // If response is not JSON, use statusText or a generic message
      errorData = { detail: response.statusText || `Request failed with status ${response.status}` };
    }
    console.error(`[API_CLIENT - BROWSER] API Error ${response.status} for ${path}:`, errorData);
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type");

  // Handle no content response (e.g., for HTTP 204)
  if (response.status === 204 || !contentType) {
    return undefined as T; // Or handle as appropriate for your API (e.g., return {} as T)
  }

  if (options.responseType === 'blob' || (contentType && (contentType.startsWith('video/') || contentType.startsWith('image/') || contentType === 'application/octet-stream'))) {
    return response.blob() as Promise<T>;
  }
  
  if (contentType && contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }
  
  // Fallback for other content types, e.g., text/plain
  // For now, assuming JSON or blob are the primary expected types.
  console.warn(`[API_CLIENT - BROWSER] Unexpected content type: ${contentType} for path ${path}. Trying to parse as text.`);
  return response.text() as Promise<T>; // Or handle more specific text cases if needed
}

export async function listVideosApi(token: string): Promise<VideoAsset[]> {
  console.log("[API_CLIENT - BROWSER] listVideosApi called");
  return fetchWithAuth<VideoAsset[]>('/videos', { token, method: 'GET' });
}

export async function uploadVideoApi(formData: FormData, token: string): Promise<VideoAsset> {
  console.log("[API_CLIENT - BROWSER] uploadVideoApi called");
  // For FormData, Content-Type is set by the browser. Do not set it manually.
  return fetchWithAuth<VideoAsset>('/upload', {
    method: 'POST',
    body: formData,
    token,
  });
}

export async function getVideoApi(filename: string, token: string): Promise<Blob> {
  console.log(`[API_CLIENT - BROWSER] getVideoApi called for filename: ${filename}`);
  return fetchWithAuth<Blob>(`/videos/${encodeURIComponent(filename)}`, {
    token,
    method: 'GET',
    responseType: 'blob',
  });
}

export async function setPreferenceApi(
  payload: { key: string; value: any },
  token: string
): Promise<void> { // Assuming POST /preferences returns no content (204) or simple success
  console.log("[API_CLIENT - BROWSER] setPreferenceApi called with payload:", payload);
  await fetchWithAuth<void>('/preferences', { // Expecting no content or just success status
    method: 'POST',
    body: JSON.stringify(payload),
    token,
    // headers: { 'Content-Type': 'application/json' }, // fetchWithAuth handles this
  });
}
