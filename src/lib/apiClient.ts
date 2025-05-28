
'use server'; // Can be used by server components if needed, but primarily for client-side fetch

import type { VideoAsset } from '@/lib/types';

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
}

async function fetchWithAuth<T = any>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const apiUrl = getApiUrl();
  const headers = new Headers(options.headers || {});

  if (options.token) {
    headers.append('Authorization', `Bearer ${options.token}`);
  }

  // Do not set Content-Type for FormData, browser will do it with boundary
  if (!(options.body instanceof FormData)) {
    if (!headers.has('Content-Type') && options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase())) {
      headers.append('Content-Type', 'application/json');
    }
  }
  
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch (e) {
      errorData = { detail: response.statusText || "An unknown error occurred" };
    }
    console.error(`API Error ${response.status} for ${path}:`, errorData);
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  // Handle cases where response might be empty (e.g., 204 No Content)
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.indexOf("application/json") !== -1) {
    return response.json() as Promise<T>;
  }
  // For file downloads or non-JSON responses
  if (response.status === 200 && (path.startsWith('/videos/') || options.responseType === 'blob')) {
    return response.blob() as Promise<T>;
  }
  return undefined as T; // Or handle as text, etc.
}

export async function listVideosApi(token: string): Promise<VideoAsset[]> {
  return fetchWithAuth<VideoAsset[]>('/videos', { token });
}

export async function uploadVideoApi(formData: FormData, token: string): Promise<VideoAsset> {
  // Assuming the API returns the newly created/updated VideoAsset on successful upload
  return fetchWithAuth<VideoAsset>('/upload', {
    method: 'POST',
    body: formData,
    token,
  });
}

export async function getVideoApi(filename: string, token: string): Promise<Blob> {
  // Ensure the filename is properly encoded if it can contain special characters
  return fetchWithAuth<Blob>(`/videos/${encodeURIComponent(filename)}`, {
    token,
    responseType: 'blob', // Custom option to indicate blob response
  } as FetchOptions);
}

export async function setPreferenceApi(
  payload: { key: string; value: any },
  token: string
): Promise<void> {
  await fetchWithAuth('/preferences', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  });
}
