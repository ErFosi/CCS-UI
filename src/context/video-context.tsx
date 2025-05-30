
"use client";

import type { VideoAsset, ProcessVideoApiResponse, SelectionCoordinates } from '@/lib/types';
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context';
import { listVideosApi, uploadVideoApi, getVideoApi, deleteVideoApi, getApiBaseUrl, processVideoApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { isValid, parseISO } from 'date-fns';

interface VideoContextType {
  videos: VideoAsset[];
  isLoading: boolean;
  error: string | null;
  fetchVideos: () => Promise<void>;
  uploadVideo: (file: File, originalName: string, width?: number, height?: number) => Promise<void>; // Added width/height
  downloadVideo: (video: VideoAsset, type: 'original' | 'censored') => Promise<void>;
  deleteVideo: (videoId: string, filename: string, processedFilename?: string) => Promise<void>;
  processVideo: (videoToProcess: VideoAsset, coordinates: SelectionCoordinates) => Promise<void>;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

const PROCESSED_PREFIX = "processed_";

export const VideoProvider = ({ children }: { children: ReactNode }) => {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getToken, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const apiBaseUrl = getApiBaseUrl();

  const fetchVideos = useCallback(async () => {
    if (!isAuthenticated) {
      console.log("[VideoContext] FetchVideos skipped: User not authenticated.");
      setVideos([]);
      return;
    }
    const token = await getToken();
    if (!token) {
      setError("Authentication token not available for fetching videos.");
      toast({ title: "Authentication Error", description: "Could not retrieve auth token.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const rawVideosFromApi: any[] = await listVideosApi(token); // Assuming this returns the structure from your API
      console.log("[VideoContext] Raw videos fetched from API:", JSON.stringify(rawVideosFromApi, null, 2));

      const processedVideosMap = new Map<string, any>();
      const originalVideoData: any[] = [];

      rawVideosFromApi.forEach(apiVideo => {
        const filename = apiVideo.filename || apiVideo.name; // Adjust based on your API response
        if (filename && typeof filename === 'string' && filename.startsWith(PROCESSED_PREFIX)) {
          const originalFilename = filename.substring(PROCESSED_PREFIX.length);
          processedVideosMap.set(originalFilename, { ...apiVideo, filename });
        } else if (filename) {
          originalVideoData.push({ ...apiVideo, filename });
        } else {
          console.warn("[VideoContext] fetchVideos: API video item missing usable filename. Item:", apiVideo);
        }
      });

      const consolidatedVideos: VideoAsset[] = originalVideoData.map((apiOriginalVideo: any) => {
        const originalFilename = apiOriginalVideo.filename;
        let uniqueId: string;

        if (apiOriginalVideo && typeof apiOriginalVideo.id === 'string' && apiOriginalVideo.id.trim() !== '') {
          uniqueId = apiOriginalVideo.id;
        } else if (originalFilename && typeof originalFilename === 'string' && originalFilename.trim() !== '') {
          uniqueId = originalFilename;
        } else {
          uniqueId = crypto.randomUUID();
          console.warn("[VideoContext] fetchVideos: API original video item missing 'id' or valid 'filename' for key. Using UUID. Item:", apiOriginalVideo);
        }

        const videoAsset: VideoAsset = {
          id: uniqueId,
          name: apiOriginalVideo.name || originalFilename || "Untitled Video",
          filename: originalFilename,
          originalUrl: apiOriginalVideo.originalUrl || (originalFilename ? `${apiBaseUrl}/videos/${encodeURIComponent(originalFilename)}` : undefined),
          uploadDate: apiOriginalVideo.uploadDate || apiOriginalVideo.LastModified || new Date().toISOString(),
          status: 'uploaded',
          error: apiOriginalVideo.error,
          // IMPORTANT MAPPING: Ensure your API provides these or map them
          originalWidth: apiOriginalVideo.originalWidth || apiOriginalVideo.width,
          originalHeight: apiOriginalVideo.originalHeight || apiOriginalVideo.height,
        };
        if (!videoAsset.originalWidth || !videoAsset.originalHeight) {
            console.warn(`[VideoContext] Video '${videoAsset.name}' fetched from API is missing dimensions.`);
        }

        const processedVersion = processedVideosMap.get(originalFilename);
        if (processedVersion) {
          videoAsset.status = 'censored';
          videoAsset.processedFilename = processedVersion.filename;
          if (videoAsset.processedFilename) {
            videoAsset.censoredUrl = `${apiBaseUrl}/videos/${encodeURIComponent(videoAsset.processedFilename)}`;
          }
        }
        return videoAsset;
      }).sort((a, b) => {
        const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
      });

      console.log("[VideoContext] Videos consolidated and set successfully:", JSON.stringify(consolidatedVideos, null, 2));
      setVideos(consolidatedVideos);
    } catch (errCatch) {
      const err = errCatch as Error;
      const errorMessage = err.message || "Failed to fetch videos";
      console.error("[VideoContext] Error fetching videos:", err);
      setError(errorMessage);
      toast({ title: "Failed to Load Videos", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [getToken, isAuthenticated, toast, apiBaseUrl]);


  const uploadVideo = async (file: File, originalName: string, width?: number, height?: number) => {
    if (!isAuthenticated) {
        toast({ title: "Authentication Required", description: "Please log in to upload videos.", variant: "destructive" });
        return;
    }
    const token = await getToken();
    if (!token) {
        toast({ title: "Authentication Error", description: "Could not retrieve auth token for upload.", variant: "destructive" });
        return;
    }

    const tempId = crypto.randomUUID();
    const placeholderVideo: VideoAsset = {
      id: tempId,
      name: originalName,
      filename: originalName,
      uploadDate: new Date().toISOString(),
      status: 'uploading',
      originalUrl: URL.createObjectURL(file),
      originalWidth: width, // Store passed width
      originalHeight: height, // Store passed height
    };
    console.log("[VideoContext] Adding placeholder video with dimensions:", {width, height});

    setVideos(prev => [placeholderVideo, ...prev].sort((a, b) => {
        const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
    }));

    const formData = new FormData();
    formData.append('file', file, originalName);
    // Optionally, send dimensions to backend if it can store them
    // if (width) formData.append('originalWidth', width.toString());
    // if (height) formData.append('originalHeight', height.toString());

    try {
      const uploadedVideoDataFromApi: any = await uploadVideoApi(formData, token);
      console.log("[VideoContext] Raw data from upload API:", JSON.stringify(uploadedVideoDataFromApi, null, 2));

      const apiFilename = uploadedVideoDataFromApi.filename || uploadedVideoDataFromApi.name || originalName;
      let finalId = uploadedVideoDataFromApi.id;
      if (!finalId || (typeof finalId === 'string' && finalId.trim() === '')) {
        finalId = apiFilename;
      }
      if (!finalId) {
          finalId = tempId;
          console.warn("[VideoContext] Upload API response missing usable 'id' or 'filename'. Using tempId for new video. Response:", uploadedVideoDataFromApi);
      }

      const newVideo: VideoAsset = {
        id: finalId,
        name: uploadedVideoDataFromApi.name || originalName,
        filename: apiFilename,
        originalUrl: uploadedVideoDataFromApi.originalUrl || (apiFilename ? `${apiBaseUrl}/videos/${encodeURIComponent(apiFilename)}` : undefined),
        uploadDate: uploadedVideoDataFromApi.uploadDate || new Date().toISOString(),
        status: 'uploaded',
        error: uploadedVideoDataFromApi.error,
        // IMPORTANT MAPPING: Ensure your API returns these or use the client-derived ones
        originalWidth: uploadedVideoDataFromApi.originalWidth || width,
        originalHeight: uploadedVideoDataFromApi.originalHeight || height,
      };

      if (placeholderVideo.originalUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(placeholderVideo.originalUrl);
      }

      console.log("[VideoContext] New video object after upload:", JSON.stringify(newVideo, null, 2));
      setVideos(prev => prev.map(v => v.id === tempId ? newVideo : v)
                           .sort((a, b) => {
                                const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
                                const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
                                return dateB - dateA;
                           }));
      toast({ title: "Upload Successful", description: `${newVideo.name} has been uploaded. Ready for processing.`, variant: "default" });
    } catch (errCatch) {
      const error = errCatch as Error;
      const errorMessage = error.message || "Failed to upload video";
      console.error(`[VideoContext] Error uploading video ${originalName}:`, error);

      if (placeholderVideo.originalUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(placeholderVideo.originalUrl);
      }
      setVideos(prev => prev.map(v => v.id === tempId ? { ...v, status: 'failed', error: errorMessage, originalUrl: undefined } : v)
                           .sort((a, b) => {
                                const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
                                const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
                                return dateB - dateA;
                           }));
      toast({ title: "Upload Failed", description: errorMessage, variant: "destructive" });
    }
  };

  const downloadVideo = async (video: VideoAsset, type: 'original' | 'censored') => {
    if (!isAuthenticated) {
        toast({ title: "Authentication Required", description: "Please log in to download videos.", variant: "destructive" });
        return;
    }
    const token = await getToken();
    if (!token) {
        toast({ title: "Authentication Error", description: "Could not retrieve auth token for download.", variant: "destructive" });
        return;
    }

    let filenameForApi = type === 'original' ? video.filename : video.processedFilename;
    let downloadName = type === 'original' ? video.name : (video.processedFilename || `censored_${video.name}`);

    if (!filenameForApi) {
        toast({ title: "Download Error", description: `${type} video file details not available.`, variant: "destructive" });
        return;
    }

    toast({ title: "Download Started", description: `Preparing to download ${downloadName}...` });
    try {
      const blob = await getVideoApi(filenameForApi, token);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Download Complete", description: `${downloadName} downloaded.`, variant: "default" });
    } catch (errCatch) {
      const error = errCatch as Error;
      const errorMessage = error.message || `Failed to download ${type} video`;
      console.error(`[VideoContext] Error downloading ${type} video ${video.name}:`, error);
      toast({ title: "Download Failed", description: errorMessage, variant: "destructive" });
    }
  };

  const deleteVideo = async (videoId: string, filename: string, processedFilename?: string) => {
    if (!isAuthenticated) {
      toast({ title: "Authentication Required", description: "Please log in to delete videos.", variant: "destructive" });
      return;
    }
    const token = await getToken();
    if (!token) {
      toast({ title: "Authentication Error", description: "Could not retrieve auth token for deletion.", variant: "destructive" });
      return;
    }

    const videoToDelete = videos.find(v => v.id === videoId);
    const videoNameForToast = videoToDelete ? videoToDelete.name : filename;

    try {
      await deleteVideoApi(filename, token);
      console.log(`[VideoContext] Original video ${filename} deleted from backend.`);

      if (processedFilename && processedFilename !== filename) {
        try {
          await deleteVideoApi(processedFilename, token);
          console.log(`[VideoContext] Processed video ${processedFilename} deleted from backend.`);
        } catch (processDeleteError) {
          console.warn(`[VideoContext] Failed to delete processed file ${processedFilename}, original might still be deleted. Error:`, processDeleteError);
        }
      }

      setVideos(prevVideos => prevVideos.filter(v => v.id !== videoId));
      toast({ title: "Video Deleted", description: `Video "${videoNameForToast}" and its versions have been deleted.`, variant: "default" });
    } catch (errCatch) {
      const error = errCatch as Error;
      const errorMessage = error.message || "Failed to delete video.";
      console.error(`[VideoContext] Error deleting video ${filename}:`, error);
      toast({ title: "Deletion Failed", description: errorMessage, variant: "destructive" });
    }
  };

  const processVideo = async (videoToProcess: VideoAsset, coordinates: SelectionCoordinates) => {
    if (!isAuthenticated) {
      toast({ title: "Authentication Required", description: "Please log in to process videos.", variant: "destructive" });
      return;
    }
    const token = await getToken();
    if (!token) {
      toast({ title: "Authentication Error", description: "Could not retrieve auth token for processing.", variant: "destructive" });
      return;
    }
    if (!videoToProcess.filename) {
        toast({ title: "Processing Error", description: "Video filename is missing, cannot process.", variant: "destructive" });
        return;
    }

    setVideos(prev => prev.map(v => v.id === videoToProcess.id ? { ...v, status: 'censoring' } : v));
    toast({ title: "Processing Started", description: `Processing video: ${videoToProcess.name}`});

    try {
      const response = await processVideoApi(videoToProcess.filename, coordinates, token);
      console.log("[VideoContext] Process video API response:", response);

      setVideos(prev => prev.map(v =>
        v.id === videoToProcess.id ? {
          ...v,
          status: 'censored',
          processedFilename: response.processed_filename,
          censoredUrl: response.processed_filename ? `${apiBaseUrl}/videos/${encodeURIComponent(response.processed_filename)}` : undefined,
        } : v
      ).sort((a, b) => {
        const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
      }));
      toast({ title: "Processing Successful", description: `${videoToProcess.name} has been processed.`, variant: "default" });
    } catch (errCatch) {
      const error = errCatch as Error;
      const errorMessage = error.message || `Failed to process video ${videoToProcess.name}`;
      console.error(`[VideoContext] Error processing video ${videoToProcess.name}:`, error);
      setVideos(prev => prev.map(v =>
        v.id === videoToProcess.id ? { ...v, status: 'failed', error: errorMessage } : v
      ).sort((a, b) => {
        const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
      }));
      toast({ title: "Processing Failed", description: errorMessage, variant: "destructive" });
    }
  };


  return (
    <VideoContext.Provider value={{ videos, isLoading, error, fetchVideos, uploadVideo, downloadVideo, deleteVideo, processVideo }}>
      {children}
    </VideoContext.Provider>
  );
};

export const useVideoContext = () => {
  const context = useContext(VideoContext);
  if (context === undefined) {
    throw new Error('useVideoContext must be used within a VideoProvider');
  }
  return context;
};

