
export interface VideoAsset {
  id: string; // Should be unique, e.g., S3 key or UUID
  name: string; // User-friendly display name
  filename: string; // Actual filename used for API calls (original video)
  originalUrl?: string; // Full URL for original video streaming/download (e.g., from FastAPI GET /videos/{filename})
  censoredUrl?: string; // Full URL for censored video, updated after processing
  processedFilename?: string; // Filename of the processed/censored video
  uploadDate?: string; // ISO string
  status: 'uploading' | 'uploaded' | 'censoring' | 'censored' | 'failed';
  error?: string;
  originalWidth?: number;
  originalHeight?: number;
}

export interface ProcessVideoApiResponse {
  message: string;
  processed_filename: string; // Ensure this matches your API response key
  s3_key: string; // Ensure this matches
  status: 'processed' | string; // Ensure this matches
}

// Defines the structure of user preferences fetched from AND sent to the API
export interface UserPreference {
  darkTheme?: boolean;
  // Add other preference fields here if your API handles them
}

export interface SelectionCoordinates {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
