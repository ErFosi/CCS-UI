
export interface VideoAsset {
  id: string;
  name: string;
  originalDataUri: string;
  censoredDataUri?: string; // Changed from upscaledDataUri
  originalWidth?: number;
  originalHeight?: number;
  uploadDate: string; // ISO string
  status: 'uploaded' | 'censoring' | 'censored' | 'failed'; // Changed status values
  error?: string;
}
```