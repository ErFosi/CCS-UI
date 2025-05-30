
export interface VideoAsset {
  id: string;
  name: string;
  filename: string; // Actual filename for API calls (original)
  originalUrl?: string; // Full URL for original video streaming/download
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
  darkTheme?: boolean; // Changed from theme: 'light' | 'dark'
  // Add other preference fields here if your API handles them
  // e.g., videoQuality?: 'auto' | '720p' | '1080p';
  // e.g., notificationsEnabled?: boolean;
}
