
// Client-side API client

import type { VideoAsset } from '@/lib/types';

const getApiUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrl) {
    console.error("[API_CLIENT - BROWSER] Error: NEXT_PUBLIC_FASTAPI_URL is not defined in environment variables.");
    // Fallback or throw error, depending on how critical it is
    // For now, let's use a placeholder that will likely fail, to make it obvious
    return "http://localhost:0/api_url_not_configured"; 
  }
  console.log(`[API_CLIENT - BROWSER] Using API Base URL: ${apiUrl}`); // Added log
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
  const apiUrl = getApiUrl(); // This will now log the apiUrl
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
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { detail: response.statusText || `Request failed with status ${response.status}` };
    }
    console.error(`[API_CLIENT - BROWSER] API Error ${response.status} for ${path}:`, errorData);
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
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

export async function listVideosApi(token: string): Promise<VideoAsset[]> {
  console.log("[API_CLIENT - BROWSER] listVideosApi called");
  return fetchWithAuth<VideoAsset[]>('/videos', { token, method: 'GET' });
}

export async function uploadVideoApi(formData: FormData, token: string): Promise<VideoAsset> {
  console.log("[API_CLIENT - BROWSER] uploadVideoApi called");
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
): Promise<void> { 
  console.log("[API_CLIENT - BROWSER] setPreferenceApi called with payload:", payload);
  await fetchWithAuth<void>('/preferences', { 
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  });
}
