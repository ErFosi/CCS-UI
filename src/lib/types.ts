
export interface VideoAsset {
  id: string; // Should be unique, e.g., S3 key or backend-generated ID
  name: string; // User-provided or derived filename for display
  filename: string; // Actual filename used for API calls (e.g., "video.mp4" part of S3 key)
  
  originalUrl?: string; // Full URL constructed by frontend for streaming/download
  censoredUrl?: string; // Full URL for censored version, updated after processing
  processedFilename?: string; // Filename of the processed/censored video

  uploadDate?: string; // ISO string
  status: 'uploading' | 'uploaded' | 'censoring' | 'censored' | 'failed';
  error?: string;
  originalWidth?: number;
  originalHeight?: number;
}

export interface ProcessVideoApiResponse {
  message: string;
  processed_filename: string;
  s3_key: string; // Assuming this is the full S3 key of the processed video
  status: 'processed' | string; // Or a more specific status
}
