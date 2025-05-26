export interface VideoAsset {
  id: string;
  name: string;
  originalDataUri: string;
  upscaledDataUri?: string;
  originalWidth?: number;
  originalHeight?: number;
  uploadDate: string; // ISO string
  status: 'uploaded' | 'upscaling' | 'completed' | 'failed';
  error?: string;
}
