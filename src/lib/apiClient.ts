
// Client-side API client
import type { VideoAsset, ProcessVideoApiResponse, UserPreference, SelectionCoordinates } from '@/lib/types';

export const getApiBaseUrl = (): string => {
  const apiUrlFromEnv = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrlFromEnv) {
    const defaultUrl = "http://localhost:8000"; // Fallback for safety
    console.warn(
      `[API_CLIENT - BROWSER] WARN: NEXT_PUBLIC_FASTAPI_URL is not defined. Using default: ${defaultUrl}. This may not be correct.`
    );
    return defaultUrl;
  }
  // console.log(`[API_CLIENT - BROWSER] Using API Base URL: ${apiUrlFromEnv}`);
  return apiUrlFromEnv;
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

  // Content-Type for FormData is set automatically by the browser, including the boundary.
  // For JSON, we set it explicitly.
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.append('Content-Type', 'application/json');
  }
  
  console.log(`[API_CLIENT - BROWSER] Making ${options.method || 'GET'} request to: ${fullUrl}`);
  if (options.body instanceof FormData) {
    // console.log("[API_CLIENT - BROWSER] Request body is FormData. Content-Type will be set by browser.");
    // For FormData, log entries for debugging
    // for (let [key, value] of (options.body as FormData).entries()) {
    //   if (value instanceof File) {
    //     console.log(`[API_CLIENT - BROWSER] FormData field: ${key} = File { name: ${value.name}, size: ${value.size}, type: ${value.type} }`);
    //   } else {
    //     console.log(`[API_CLIENT - BROWSER] FormData field: ${key} = ${value}`);
    //   }
    // }
  } else if (options.body) {
    // console.log("[API_CLIENT - BROWSER] Request body (JSON/Text):", options.body);
  }


  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: any = {};
    let errorMessageText = `Request failed with status ${response.status} ${response.statusText || '(Unknown Error)'}`;
    try {
      // Try to parse as JSON, but fallback if it's not JSON
      const responseText = await response.text();
      if (responseText) {
        try {
          errorData = JSON.parse(responseText);
          errorMessageText = errorData?.detail || errorData?.message || errorMessageText;
        } catch (parseError) {
          // If parsing fails, use the raw text as the message if it's short enough
          errorMessageText = responseText.length < 100 ? responseText : errorMessageText;
          console.warn(`[API_CLIENT - BROWSER] Could not parse error response as JSON for ${path}. Status: ${response.status}. Raw response: ${responseText}`);
        }
      }
    } catch (e) {
      // Ignore error during error text parsing
    }
    console.error(`[API_CLIENT - BROWSER] API Error ${response.status} for ${path}:`, errorData);
    const error = new Error(errorMessageText) as any;
    error.response = response; 
    error.data = errorData; 
    throw error;
  }

  const contentType = response.headers.get("content-type");
  // Default to 'json' if content type suggests it, otherwise 'text', allow override by options.responseType
  let effectiveResponseType = options.responseType;
  if (!effectiveResponseType) {
    if (contentType && contentType.includes("application/json")) {
      effectiveResponseType = 'json';
    } else if (contentType && contentType.startsWith("video/") || contentType && contentType.startsWith("image/") || contentType && contentType.includes("octet-stream")) {
      effectiveResponseType = 'blob'; // Smart default for media types
    } else {
      effectiveResponseType = 'text';
    }
  }
  
  if (response.status === 204) { 
    return undefined as T; 
  }
  
  if (effectiveResponseType === 'blob') {
    return response.blob() as Promise<T>;
  }
  
  if (effectiveResponseType === 'json') {
    return response.json() as Promise<T>;
  }
  
  return response.text() as Promise<T>;
}

// Expects API to return a list of objects, maps to VideoAsset[] in context
export async function listVideosApi(token: string): Promise<any[]> { 
  console.log("[API_CLIENT - BROWSER] listVideosApi called");
  return fetchWithAuth<any[]>('/videos', { token, method: 'GET', responseType: 'json' });
}

// Expects API to return a VideoAsset-like object
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

export async function processVideoApi(
  filename: string, 
  coordinates: SelectionCoordinates,
  token: string
): Promise<ProcessVideoApiResponse> {
  console.log(`[API_CLIENT - BROWSER] processVideoApi called for filename: ${filename} with coordinates:`, coordinates);
  
  const formData = new FormData();
  formData.append('filename', filename); // Send filename as a string
  formData.append('x1', coordinates.x1.toString());
  formData.append('y1', coordinates.y1.toString());
  formData.append('x2', coordinates.x2.toString());
  formData.append('y2', coordinates.y2.toString());
  // Note: We are NOT sending the file again. The backend should use the 'filename'
  // to retrieve the already uploaded file from S3 for processing.
  // If your backend *requires* the file in this request (matching your curl's -F file=@...),
  // this frontend logic would need a way to re-access the original File object, which is complex.

  return fetchWithAuth<ProcessVideoApiResponse>('/process', {
    method: 'POST',
    body: formData, 
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

export async function getPreferenceApi(token: string): Promise<UserPreference> {
  console.log("[API_CLIENT - BROWSER] getPreferenceApi called");
  return fetchWithAuth<UserPreference>('/preferences', {
    token,
    method: 'GET',
    responseType: 'json',
  });
}

export async function setPreferenceApi(
  payload: UserPreference,
  token: string
): Promise<void> { 
  console.log("[API_CLIENT - BROWSER] setPreferenceApi called with payload:", payload);
  await fetchWithAuth<any>('/preferences', { 
    method: 'POST',
    body: JSON.stringify(payload),
    token,
    responseType: 'json' 
  });
}
