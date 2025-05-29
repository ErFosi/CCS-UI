
"use client";

import type { VideoAsset, ProcessVideoApiResponse } from '@/lib/types';
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
  uploadVideo: (file: File, originalName: string) => Promise<void>;
  downloadVideo: (video: VideoAsset, type: 'original' | 'censored') => Promise<void>;
  deleteVideo: (videoId: string, filename: string, processedFilename?: string) => Promise<void>;
  processVideo: (videoToProcess: VideoAsset) => Promise<void>;
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
      const rawVideosFromApi = await listVideosApi(token);
      console.log("[VideoContext] Raw videos fetched from API:", JSON.stringify(rawVideosFromApi, null, 2));
      
      const processedVideosMap = new Map<string, any>();
      const originalVideoData: any[] = [];

      rawVideosFromApi.forEach(apiVideo => {
        const filename = apiVideo.filename || apiVideo.name; // API might use 'name' or 'filename'
        if (filename && typeof filename === 'string' && filename.startsWith(PROCESSED_PREFIX)) {
          const originalFilename = filename.substring(PROCESSED_PREFIX.length);
          processedVideosMap.set(originalFilename, apiVideo);
        } else if (filename) { // Ensure it's an original and has a filename
          originalVideoData.push(apiVideo);
        } else {
          console.warn("[VideoContext] fetchVideos: API video item missing usable filename. Item:", apiVideo);
        }
      });

      const consolidatedVideos: VideoAsset[] = originalVideoData.map((apiOriginalVideo: any) => {
        let uniqueId: string;
        const originalFilename = apiOriginalVideo.filename || apiOriginalVideo.name;

        if (apiOriginalVideo && typeof apiOriginalVideo.id === 'string' && apiOriginalVideo.id.trim() !== '') {
          uniqueId = apiOriginalVideo.id;
        } else if (originalFilename && typeof originalFilename === 'string' && originalFilename.trim() !== '') {
          uniqueId = originalFilename;
        } else {
          uniqueId = crypto.randomUUID();
          console.warn("[VideoContext] fetchVideos: API original video item missing 'id' or 'filename' for key. Using UUID. Item:", apiOriginalVideo);
        }
        
        // IMPORTANT MAPPING: Adjust these field names based on your API response structure
        const videoAsset: VideoAsset = {
          id: uniqueId,
          name: apiOriginalVideo.name || originalFilename || "Untitled Video",
          filename: originalFilename, // This should be the filename used for GET /videos/{filename} for original
          originalUrl: apiOriginalVideo.originalUrl || (originalFilename ? `${apiBaseUrl}/videos/${encodeURIComponent(originalFilename)}` : undefined),
          uploadDate: apiOriginalVideo.uploadDate || apiOriginalVideo.lastModified || new Date().toISOString(), // S3 might return LastModified
          status: 'uploaded', // Default, will be updated
          error: apiOriginalVideo.error,
          originalWidth: apiOriginalVideo.originalWidth,
          originalHeight: apiOriginalVideo.originalHeight,
        };

        const processedVersion = processedVideosMap.get(originalFilename);
        if (processedVersion) {
          videoAsset.status = 'censored';
          videoAsset.processedFilename = processedVersion.filename || processedVersion.name;
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


  const uploadVideo = async (file: File, originalName: string) => {
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
      originalUrl: URL.createObjectURL(file)
    };

    setVideos(prev => [placeholderVideo, ...prev].sort((a, b) => {
        const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
    }));

    const formData = new FormData();
    formData.append('file', file, originalName);

    try {
      const uploadedVideoDataFromApi = await uploadVideoApi(formData, token);
      console.log("[VideoContext] Raw data from upload API:", JSON.stringify(uploadedVideoDataFromApi, null, 2));
      
      let finalId: string;
      // IMPORTANT MAPPING: Use the filename or ID returned by your API
      const apiFilename = uploadedVideoDataFromApi.filename || uploadedVideoDataFromApi.name || originalName; 
      
      if (uploadedVideoDataFromApi && typeof uploadedVideoDataFromApi.id === 'string' && uploadedVideoDataFromApi.id.trim() !== '') {
        finalId = uploadedVideoDataFromApi.id;
      } else if (apiFilename && typeof apiFilename === 'string' && apiFilename.trim() !== '') {
        finalId = apiFilename;
      } else {
        finalId = tempId;
        console.warn("[VideoContext] Upload API response missing string 'id' or 'filename'. Using tempId. Response:", uploadedVideoDataFromApi);
      }

      const newVideo: VideoAsset = {
        id: finalId,
        name: uploadedVideoDataFromApi.name || originalName,
        filename: apiFilename, // Filename for API calls (original)
        originalUrl: uploadedVideoDataFromApi.originalUrl || (apiFilename ? `${apiBaseUrl}/videos/${encodeURIComponent(apiFilename)}` : undefined),
        uploadDate: uploadedVideoDataFromApi.uploadDate || new Date().toISOString(),
        status: 'uploaded',
        error: uploadedVideoDataFromApi.error,
        originalWidth: uploadedVideoDataFromApi.originalWidth,
        originalHeight: uploadedVideoDataFromApi.originalHeight,
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
      setVideos(prev => prev.map(v => v.id === tempId ? { ...v, originalUrl: undefined, status: 'failed', error: errorMessage } : v)
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

    try {
      await deleteVideoApi(filename, token);
      if (processedFilename && processedFilename !== filename) {
        try {
          await deleteVideoApi(processedFilename, token);
        } catch (processDeleteError) {
          console.warn(`[VideoContext] Failed to delete processed file ${processedFilename}, original might still be deleted. Error:`, processDeleteError);
        }
      }
      setVideos(prevVideos => prevVideos.filter(v => v.id !== videoId));
      toast({ title: "Video Deleted", description: `Video and its processed version (if any) have been deleted.`, variant: "default" });
    } catch (errCatch) {
      const error = errCatch as Error;
      const errorMessage = error.message || "Failed to delete video.";
      console.error(`[VideoContext] Error deleting video ${filename}:`, error);
      toast({ title: "Deletion Failed", description: errorMessage, variant: "destructive" });
    }
  };

  const processVideo = async (videoToProcess: VideoAsset) => {
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
      const response = await processVideoApi(videoToProcess.filename, token);
      console.log("[VideoContext] Process video API response:", response);
      
      setVideos(prev => prev.map(v => 
        v.id === videoToProcess.id ? { 
          ...v, 
          status: 'censored', // Assuming 'processed' from API means 'censored' for UI
          processedFilename: response.processed_filename,
          censoredUrl: response.processed_filename ? `${apiBaseUrl}/videos/${encodeURIComponent(response.processed_filename)}` : undefined,
        } : v
      ));
      toast({ title: "Processing Successful", description: `${videoToProcess.name} has been processed.`, variant: "default" });
    } catch (errCatch) {
      const error = errCatch as Error;
      const errorMessage = error.message || `Failed to process video ${videoToProcess.name}`;
      console.error(`[VideoContext] Error processing video ${videoToProcess.name}:`, error);
      setVideos(prev => prev.map(v => 
        v.id === videoToProcess.id ? { ...v, status: 'failed', error: errorMessage } : v
      ));
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

