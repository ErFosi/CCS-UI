
'use server'; // Can be used by server components if needed, but primarily for client-side fetch

import type { VideoAsset } from '@/lib/types';
import https from 'https'; // For custom agent
import NextFetch from 'node-fetch'; // Using an alias to avoid conflict with global fetch if any
import type { RequestInit as NodeFetchRequestInit, Response as NodeFetchResponse } from 'node-fetch';


const getApiUrl = (): string => {
  // Ensure this uses the correct variable for your FastAPI backend
  const apiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrl) {
    console.error("Error: NEXT_PUBLIC_FASTAPI_URL is not defined in environment variables.");
    throw new Error("API URL is not configured.");
  }
  return apiUrl;
};

interface FetchOptions extends RequestInit {
  token?: string;
  responseType?: 'blob' | 'json'; // Keep this for client-side hints if necessary
}

// Type guard for NodeFetchRequestInit
function isNodeFetchRequestInit(options: any): options is NodeFetchRequestInit {
  return 'agent' in options || 'compress' in options; // Add other node-fetch specific options if needed
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

  // Do not set Content-Type for FormData, browser will do it with boundary
  if (!(options.body instanceof FormData) && typeof options.body === 'string') {
    if (!headers.has('Content-Type') && options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase())) {
      headers.append('Content-Type', 'application/json');
    }
  }
  
  let response: Response | NodeFetchResponse;

  if (typeof window === 'undefined' && process.env.NODE_ENV === 'development' && fullUrl.startsWith('https:')) {
    // Server-side fetch in development for HTTPS: use node-fetch with rejectUnauthorized: false
    console.log(`[apiClient] Server-side DEV fetch to ${fullUrl} with SSL bypass`);
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // Bypass SSL certificate validation
    });
    
    const nodeFetchOptions: NodeFetchRequestInit = {
      method: options.method,
      headers: headers as any, // node-fetch uses a slightly different Headers type or plain object
      body: options.body as any, // FormData or string
      agent: httpsAgent,
    };
    response = await NextFetch(fullUrl, nodeFetchOptions);

  } else {
    // Client-side fetch or production server-side fetch
    console.log(`[apiClient] Standard fetch to ${fullUrl}`);
    response = await fetch(fullUrl, {
      ...options,
      headers,
    });
  }


  if (!response.ok) {
    let errorData;
    try {
      // Ensure we use .json() appropriate for the response object type
      errorData = await (response as any).json(); 
    } catch (e) {
      errorData = { detail: response.statusText || "An unknown error occurred" };
    }
    console.error(`API Error ${response.status} for ${path}:`, errorData);
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (options.responseType === 'blob' || (contentType && contentType.startsWith('video/'))) {
     // For file downloads or non-JSON responses
    return response.blob() as Promise<T>;
  }
  if (contentType && contentType.includes("application/json")) {
    return (response as any).json() as Promise<T>;
  }
  
  return undefined as T; 
}

export async function listVideosApi(token: string): Promise<VideoAsset[]> {
  return fetchWithAuth<VideoAsset[]>('/videos', { token, method: 'GET' });
}

export async function uploadVideoApi(formData: FormData, token: string): Promise<VideoAsset> {
  return fetchWithAuth<VideoAsset>('/upload', {
    method: 'POST',
    body: formData,
    token,
  });
}

export async function getVideoApi(filename: string, token: string): Promise<Blob> {
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
  await fetchWithAuth('/preferences', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
    headers: { 'Content-Type': 'application/json' },
  });
}
