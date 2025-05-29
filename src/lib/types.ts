
export interface VideoAsset {
  id: string; // Should be unique, e.g., S3 key or backend-generated ID
  name: string; // User-provided or derived filename for display
  filename: string; // Actual filename used for API calls (e.g., "video.mp4" part of S3 key)
  
  originalUrl?: string; // Full URL constructed by frontend for streaming/download
  censoredUrl?: string; // Full URL for censored version

  uploadDate?: string; // ISO string
  status: 'uploading' | 'uploaded' | 'censoring' | 'censored' | 'failed';
  error?: string;
  originalWidth?: number;
  originalHeight?: number;
}
