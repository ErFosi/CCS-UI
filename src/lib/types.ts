
export interface VideoAsset {
  id: string; // Should be provided by the backend for new videos
  name: string; // User-provided or derived filename
  filename?: string; // Actual filename used for API calls if different from name
  originalDataUri?: string; // May become originalUrl if API returns URLs
  censoredDataUri?: string; // May become censoredUrl
  originalUrl?: string; // URL for the original video, if API provides it
  censoredUrl?: string; // URL for the censored video, if API provides it
  originalWidth?: number;
  originalHeight?: number;
  uploadDate: string; // ISO string, likely set by backend
  status: 'uploading' | 'uploaded' | 'censoring' | 'censored' | 'failed'; // Statuses
  error?: string;
  // Add any other fields your FastAPI backend returns for a video
  // For example, if API returns URLs for playback/download:
  // download_url_original?: string;
  // download_url_censored?: string;
}
