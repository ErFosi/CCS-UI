
// Client-side API client
import type { VideoAsset, ProcessVideoApiResponse } from '@/lib/types';

// Renamed and exported this function
export const getApiBaseUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrl) {
    console.error("[API_CLIENT - BROWSER] Error: NEXT_PUBLIC_FASTAPI_URL is not defined in environment variables.");
    return "http://localhost:0/api_url_not_configured";
  }
  // console.log(`[API_CLIENT - BROWSER] Using API Base URL: ${apiUrl}`);
  return apiUrl;
};


interface FetchOptions extends RequestInit {
  token?: string;
  responseType?: 'blob' | 'json' | 'text';
}

async function fetchWithAuth<T = any>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const apiUrl = getApiBaseUrl();
  const fullUrl = `${apiUrl}${path}`;
  const headers = new Headers(options.headers || {});

  if (options.token) {
    headers.append('Authorization', `Bearer ${options.token}`);
  }

  if (options.body && !(options.body instanceof FormData)) {
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
    let errorMessageText = `Request failed with status ${response.status} ${response.statusText || '(Unknown Error)'}`;
    try {
      const responseText = await response.text(); 
      if (responseText) {
        errorData = JSON.parse(responseText); 
        errorMessageText = errorData?.detail || errorData?.message || errorMessageText;
      }
    } catch (e) {
      // console.warn(`[API_CLIENT - BROWSER] Could not parse error response as JSON for ${path}. Status: ${response.status}. Text: ${responseText}`, e);
    }
    console.error(`[API_CLIENT - BROWSER] API Error ${response.status} for ${path}:`, errorData);
    const error = new Error(errorMessageText) as any;
    error.response = response; 
    error.data = errorData; 
    throw error;
  }

  const contentType = response.headers.get("content-type");
  const responseType = options.responseType || (contentType && contentType.includes("application/json") ? 'json' : 'text');

  if (response.status === 204) { 
    return undefined as T; 
  }
  
  if (responseType === 'blob') {
    return response.blob() as Promise<T>;
  }
  
  if (responseType === 'json') {
    if (contentType && contentType.includes("application/json")) {
      return response.json() as Promise<T>;
    } else {
      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch (e) {
        console.warn(`[API_CLIENT - BROWSER] Expected JSON but failed to parse text response for ${path}. Text: ${text}`);
        throw new Error(`Failed to parse JSON response from ${path}`);
      }
    }
  }
  
  return response.text() as Promise<T>;
}


export async function listVideosApi(token: string): Promise<any[]> { 
  console.log("[API_CLIENT - BROWSER] listVideosApi called");
  return fetchWithAuth<any[]>('/videos', { token, method: 'GET', responseType: 'json' });
}

export async function uploadVideoApi(formData: FormData, token: string): Promise<VideoAsset> {
  console.log("[API_CLIENT - BROWSER] uploadVideoApi called");
  return fetchWithAuth<VideoAsset>('/upload', {
    method: 'POST',
    body: formData,
    token,
    responseType: 'json' 
  });
}

export async function getVideoApi(filename: string, token: string): Promise<Blob> {
  const apiPath = `/videos/${encodeURIComponent(filename)}`;
  console.log(`[API_CLIENT - BROWSER] getVideoApi called for filename: ${filename}`);
  return fetchWithAuth<Blob>(apiPath, {
    token,
    method: 'GET',
    responseType: 'blob', 
  });
}

export async function processVideoApi(filename: string, token: string): Promise<ProcessVideoApiResponse> {
  console.log(`[API_CLIENT - BROWSER] processVideoApi called for filename: ${filename}`);
  return fetchWithAuth<ProcessVideoApiResponse>('/process', {
    method: 'POST',
    body: JSON.stringify({ filename }), // FastAPI expects a JSON body with a 'filename' key
    token,
    responseType: 'json',
  });
}

export async function deleteVideoApi(filename: string, token: string): Promise<{ message: string }> {
  const apiPath = `/videos/${encodeURIComponent(filename)}`;
  console.log(`[API_CLIENT - BROWSER] deleteVideoApi called for filename: ${filename}`);
  return fetchWithAuth<{ message: string }>(apiPath, {
    token,
    method: 'DELETE',
    responseType: 'json'
  });
}

export async function deleteAllUserVideosApi(token: string): Promise<{ message: string }> {
  console.log(`[API_CLIENT - BROWSER] deleteAllUserVideosApi called`);
  return fetchWithAuth<{ message: string }>('/videos', {
    token,
    method: 'DELETE',
    responseType: 'json'
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
    responseType: 'text' 
  });
}
