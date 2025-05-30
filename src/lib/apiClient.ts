
// Client-side API client
import type { VideoAsset, ProcessVideoApiResponse, UserPreference, SelectionCoordinates } from '@/lib/types';

// This function reads the environment variable and should be used by all API call functions.
export const getApiBaseUrl = (): string => {
  const apiUrlFromEnv = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrlFromEnv) {
    const defaultUrl = "http://localhost:8000"; // Fallback for safety in case env var is missing
    console.warn(
      `[API_CLIENT - BROWSER] WARN: NEXT_PUBLIC_FASTAPI_URL is not defined. Using default: ${defaultUrl}. This may not be correct.`
    );
    return defaultUrl;
  }
  // Log the base URL being used to help confirm it's from the .env
  console.log(`[API_CLIENT - BROWSER] Using API Base URL from .env: ${apiUrlFromEnv}`);
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
  const apiUrl = getApiBaseUrl(); // Ensures we use the env variable
  const fullUrl = `${apiUrl}${path}`;
  const headers = new Headers(options.headers || {});

  if (options.token) {
    headers.append('Authorization', `Bearer ${options.token}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.append('Content-Type', 'application/json');
  }
  
  console.log(`[API_CLIENT - BROWSER] Making ${options.method || 'GET'} request to: ${fullUrl}`);

  let response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers,
    });
  } catch (networkError: any) {
    // This catches low-level network errors (e.g., server down, DNS issues, SSL issues before HTTP response)
    console.error(`[API_CLIENT - BROWSER] Network error trying to reach ${fullUrl}:`, networkError);
    throw new Error(`Network error trying to reach ${fullUrl}: ${networkError.message}. Check if the API server is running, accessible, and CORS/SSL configured.`);
  }


  if (!response.ok) {
    let errorData: any = {};
    let errorMessageText = `Request to ${fullUrl} failed with status ${response.status} ${response.statusText || ''}`.trim();
    try {
      const responseText = await response.text();
      if (responseText) {
        try {
          errorData = JSON.parse(responseText);
          // Use detailed message from backend if available
          if (errorData.detail) {
            errorMessageText = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
          } else if (errorData.message) {
            errorMessageText = errorData.message;
          } else {
            errorMessageText = responseText.length < 200 ? responseText : errorMessageText; // Use short raw text if no detail/message
          }
        } catch (parseError) {
          errorMessageText = responseText.length < 200 ? responseText : errorMessageText;
          console.warn(`[API_CLIENT - BROWSER] Could not parse error response as JSON for ${path}. Status: ${response.status}. Raw response: ${responseText}`);
        }
      }
    } catch (e) {
      // Ignore error during error text parsing, keep the original status-based message
    }
    console.error(`[API_CLIENT - BROWSER] API Error ${response.status} for ${path}:`, errorData.detail || errorData.message || errorData);
    const error = new Error(errorMessageText) as any;
    error.response = response; 
    error.data = errorData; 
    throw error;
  }

  const contentType = response.headers.get("content-type");
  let effectiveResponseType = options.responseType;
  if (!effectiveResponseType) {
    if (contentType && contentType.includes("application/json")) {
      effectiveResponseType = 'json';
    } else if (contentType && (contentType.startsWith("video/") || contentType.startsWith("image/") || contentType.includes("octet-stream"))) {
      effectiveResponseType = 'blob';
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

export async function listVideosApi(token: string): Promise<VideoAsset[]> { 
  console.log("[API_CLIENT - BROWSER] listVideosApi called");
  // Assuming your API returns objects that can be directly cast to VideoAsset[]
  // If not, you might need to map the result here or in VideoContext
  return fetchWithAuth<VideoAsset[]>('/videos', { token, method: 'GET', responseType: 'json' });
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

export async function processVideoApi(
  filename: string, 
  coordinates: SelectionCoordinates,
  token: string
): Promise<ProcessVideoApiResponse> {
  console.log(`[API_CLIENT - BROWSER] processVideoApi called for filename: ${filename} with coordinates:`, coordinates);
  
  const formData = new FormData();
  // Backend expects 'filename' as a string for already uploaded files on S3.
  formData.append('filename', filename); 
  formData.append('x1', coordinates.x1.toString());
  formData.append('y1', coordinates.y1.toString());
  formData.append('x2', coordinates.x2.toString());
  formData.append('y2', coordinates.y2.toString());

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
): Promise<UserPreference> { 
  console.log("[API_CLIENT - BROWSER] setPreferenceApi called with payload:", payload);
  return fetchWithAuth<UserPreference>('/preferences', { 
    method: 'POST',
    body: JSON.stringify(payload),
    token,
    responseType: 'json' 
  });
}
