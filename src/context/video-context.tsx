
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
  deleteVideo: (videoId: string, filename: string) => Promise<void>;
  processVideo: (videoToProcess: VideoAsset) => Promise<void>;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

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
      
      const mappedVideos: VideoAsset[] = rawVideosFromApi.map((apiVideo: any) => {
        let uniqueId: string;
        if (apiVideo && typeof apiVideo.id === 'string' && apiVideo.id.trim() !== '') {
          uniqueId = apiVideo.id;
        } else if (apiVideo && typeof apiVideo.filename === 'string' && apiVideo.filename.trim() !== '') {
          uniqueId = apiVideo.filename; 
        } else {
          uniqueId = apiVideo.name || crypto.randomUUID(); 
        }
        
        return {
          id: uniqueId,
          name: apiVideo.name || apiVideo.filename || "Untitled Video",
          filename: apiVideo.filename || apiVideo.name,
          originalUrl: apiVideo.originalUrl || (apiVideo.filename ? `${apiBaseUrl}/videos/${encodeURIComponent(apiVideo.filename)}` : undefined),
          censoredUrl: apiVideo.censoredUrl || (apiVideo.processedFilename ? `${apiBaseUrl}/videos/${encodeURIComponent(apiVideo.processedFilename)}` : undefined),
          processedFilename: apiVideo.processedFilename,
          uploadDate: apiVideo.uploadDate || new Date().toISOString(), 
          status: apiVideo.status || 'uploaded', 
          error: apiVideo.error,
          originalWidth: apiVideo.originalWidth,
          originalHeight: apiVideo.originalHeight,
        };
      }).sort((a, b) => {
        const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
      });

      console.log("[VideoContext] Videos mapped and set successfully:", JSON.stringify(mappedVideos, null, 2));
      setVideos(mappedVideos);
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
      originalUrl: URL.createObjectURL(file) // Create a temporary URL for local preview during upload
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
      
      const finalId = uploadedVideoDataFromApi.id || uploadedVideoDataFromApi.filename || tempId;
      const newVideo: VideoAsset = {
        id: finalId,
        name: uploadedVideoDataFromApi.name || originalName,
        filename: uploadedVideoDataFromApi.filename || originalName,
        originalUrl: uploadedVideoDataFromApi.originalUrl || (uploadedVideoDataFromApi.filename ? `${apiBaseUrl}/videos/${encodeURIComponent(uploadedVideoDataFromApi.filename)}` : undefined),
        censoredUrl: uploadedVideoDataFromApi.censoredUrl,
        processedFilename: uploadedVideoDataFromApi.processedFilename,
        uploadDate: uploadedVideoDataFromApi.uploadDate || new Date().toISOString(),
        status: uploadedVideoDataFromApi.status || 'uploaded',
        error: uploadedVideoDataFromApi.error,
        originalWidth: uploadedVideoDataFromApi.originalWidth,
        originalHeight: uploadedVideoDataFromApi.originalHeight,
      };
      
      if (placeholderVideo.originalUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(placeholderVideo.originalUrl); // Revoke temp blob URL
      }

      console.log("[VideoContext] New video object after upload:", JSON.stringify(newVideo, null, 2));
      setVideos(prev => prev.map(v => v.id === tempId ? newVideo : v)
                           .sort((a, b) => {
                                const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
                                const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
                                return dateB - dateA;
                           }));
      toast({ title: "Upload Successful", description: `${newVideo.name} has been uploaded.`, variant: "default" });
    } catch (errCatch) {
      const error = errCatch as Error;
      const errorMessage = error.message || "Failed to upload video";
      console.error(`[VideoContext] Error uploading video ${originalName}:`, error);
      
      if (placeholderVideo.originalUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(placeholderVideo.originalUrl); // Revoke temp blob URL on error too
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
    
    let filenameForApi = video.filename;
    let downloadName = `${type}_${video.name || video.filename}`;

    if (type === 'censored') {
        if (video.processedFilename) {
            filenameForApi = video.processedFilename;
            downloadName = video.processedFilename; // Or a more user-friendly name
        } else if (video.censoredUrl) {
            // Attempt to extract filename from censoredUrl if processedFilename is not available
            try {
                const urlParts = video.censoredUrl.split('/');
                filenameForApi = urlParts[urlParts.length -1];
                downloadName = filenameForApi;
            } catch (e) {
                 toast({ title: "Download Error", description: "Censored video filename is unclear.", variant: "destructive" });
                 return;
            }
        } else {
            toast({ title: "Download Error", description: "Censored video is not available for download.", variant: "destructive" });
            return;
        }
    }
    
    if (!filenameForApi) {
        toast({ title: "Download Error", description: "Video filename is missing.", variant: "destructive" });
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
    } catch (err) {
      const error = err as Error;
      const errorMessage = error.message || `Failed to download ${type} video`;
      console.error(`[VideoContext] Error downloading ${type} video ${video.name}:`, err);
      toast({ title: "Download Failed", description: errorMessage, variant: "destructive" });
    }
  };

  const deleteVideo = async (videoId: string, filename: string) => {
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
      setVideos(prevVideos => prevVideos.filter(v => v.id !== videoId));
      toast({ title: "Video Deleted", description: `Video "${filename}" has been deleted.`, variant: "default" });
    } catch (err) {
      const error = err as Error;
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
      setVideos(prev => prev.map(v => 
        v.id === videoToProcess.id ? { 
          ...v, 
          status: 'censored', // Assuming "processed" from API means "censored" for UI
          processedFilename: response.processed_filename,
          censoredUrl: `${apiBaseUrl}/videos/${encodeURIComponent(response.processed_filename)}` // Construct URL for the processed video
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
