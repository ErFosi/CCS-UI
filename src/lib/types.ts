
export interface VideoAsset {
  id: string; // Should be provided by the backend for new videos
  name: string; // User-provided or derived filename
  filename?: string; // Actual filename used for API calls if different from name
  
  originalUrl?: string; // URL for the original video, expected from API
  censoredUrl?: string; // URL for the censored video, expected from API
  
  originalDataUri?: string; // Fallback if URL not available, less common from API
  censoredDataUri?: string; // Fallback if URL not available

  originalWidth?: number;
  originalHeight?: number;
  uploadDate?: string; // ISO string, expected from backend
  status: 'uploading' | 'uploaded' | 'censoring' | 'censored' | 'failed'; // Statuses
  error?: string;
  // Add any other fields your FastAPI backend returns for a video
}
