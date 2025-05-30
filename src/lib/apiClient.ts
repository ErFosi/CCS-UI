
// Client-side API client
import type { VideoAsset, ProcessVideoApiResponse, UserPreference } from '@/lib/types';

// Renamed and exported this function
export const getApiBaseUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrl) {
    // Fallback for safety, but this should be configured
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

  // Don't set Content-Type for FormData, browser does it with boundary
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
      // Try to parse error response as JSON
      const responseText = await response.text(); 
      if (responseText) {
        errorData = JSON.parse(responseText); 
        errorMessageText = errorData?.detail || errorData?.message || errorMessageText;
      }
    } catch (e) {
      // console.warn(`[API_CLIENT - BROWSER] Could not parse error response as JSON for ${path}. Status: ${response.status}. Text was: ${await response.text().catch(() => '')}`, e);
    }
    console.error(`[API_CLIENT - BROWSER] API Error ${response.status} for ${path}:`, errorData);
    // Construct a new error object that includes the response and parsed data
    const error = new Error(errorMessageText) as any;
    error.response = response; // Attach the raw response
    error.data = errorData; // Attach parsed error data
    throw error;
  }

  const contentType = response.headers.get("content-type");
  // Default to 'json' if content type suggests it, otherwise 'text', allow override by options.responseType
  const responseType = options.responseType || (contentType && contentType.includes("application/json") ? 'json' : 'text');

  if (response.status === 204) { // No Content
    return undefined as T; // Or handle as appropriate, e.g., return null or an empty object
  }
  
  if (responseType === 'blob') {
    return response.blob() as Promise<T>;
  }
  
  if (responseType === 'json') {
    // Ensure we actually attempt to parse as JSON
    // Some APIs might send JSON with a non-standard content-type, or no content-type
    // If content type is explicitly application/json, great. Otherwise, we still try.
    return response.json() as Promise<T>;
  }
  
  // Default to text if not blob or json
  return response.text() as Promise<T>;
}


// Expects API to return a list of objects matching VideoAsset structure or similar
export async function listVideosApi(token: string): Promise<any[]> { 
  console.log("[API_CLIENT - BROWSER] listVideosApi called");
  // Assuming API returns objects that will be mapped to VideoAsset in context
  return fetchWithAuth<any[]>('/videos', { token, method: 'GET', responseType: 'json' });
}

// Expects API to return an object matching VideoAsset for the uploaded video
export async function uploadVideoApi(formData: FormData, token: string): Promise<VideoAsset> {
  console.log("[API_CLIENT - BROWSER] uploadVideoApi called");
  return fetchWithAuth<VideoAsset>('/upload', {
    method: 'POST',
    body: formData,
    token,
    responseType: 'json' // Expecting JSON response describing the uploaded video
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
    responseType: 'json' // Assuming a JSON response like {"message": "..."}
  });
}

export async function deleteAllUserVideosApi(token: string): Promise<{ message: string }> {
  console.log(`[API_CLIENT - BROWSER] deleteAllUserVideosApi called`);
  return fetchWithAuth<{ message: string }>('/videos', { // Assuming DELETE /videos for all user videos
    token,
    method: 'DELETE',
    responseType: 'json'
  });
}

export async function getPreferenceApi(token: string): Promise<UserPreference> {
  console.log("[API_CLIENT - BROWSER] getPreferenceApi called");
  return fetchWithAuth<UserPreference>('/preferences', {
    token,
    method: 'GET',
    responseType: 'json',
  });
}


export async function setPreferenceApi(
  payload: UserPreference, // Use UserPreference type for payload
  token: string
): Promise<void> { 
  console.log("[API_CLIENT - BROWSER] setPreferenceApi called with payload:", payload);
  // Expecting a 200 OK with no content, or a JSON response confirming success.
  // If it's 204 No Content, responseType 'text' or 'json' will try to parse and might fail.
  // If no body is expected, 'text' is safer or handle 204 specifically.
  // For now, let's assume a JSON response might come back or just a 200 OK.
  await fetchWithAuth<any>('/preferences', { 
    method: 'POST',
    body: JSON.stringify(payload),
    token,
    responseType: 'json' // Or 'text' if no meaningful JSON body is returned
  });
}
