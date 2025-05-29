
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
      const rawVideosFromApi = await listVideosApi(token); // Expects any[]
      console.log("[VideoContext] Raw videos fetched from API:", JSON.stringify(rawVideosFromApi, null, 2));
      
      const mappedVideos: VideoAsset[] = rawVideosFromApi.map((apiVideo: any) => {
        let uniqueId: string;
        if (apiVideo && typeof apiVideo.id === 'string' && apiVideo.id.trim() !== '') {
          uniqueId = apiVideo.id;
        } else if (apiVideo && typeof apiVideo.filename === 'string' && apiVideo.filename.trim() !== '') {
          // Use filename if it's a string and id isn't, common for S3 keys
          uniqueId = apiVideo.filename;
        } else {
          // Fallback to ensure a unique string key for React
          console.warn("[VideoContext] API video item missing string 'id' or 'filename'. Generating UUID for key. Item:", apiVideo);
          uniqueId = crypto.randomUUID();
        }
        
        return {
          id: uniqueId,
          name: apiVideo.name || apiVideo.filename || "Untitled Video",
          filename: apiVideo.filename || apiVideo.name, // Essential for API calls
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

    const tempId = crypto.randomUUID(); // Guaranteed unique string
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
      if (uploadedVideoDataFromApi && typeof uploadedVideoDataFromApi.id === 'string' && uploadedVideoDataFromApi.id.trim() !== '') {
        finalId = uploadedVideoDataFromApi.id;
      } else if (uploadedVideoDataFromApi && typeof uploadedVideoDataFromApi.filename === 'string' && uploadedVideoDataFromApi.filename.trim() !== '') {
        finalId = uploadedVideoDataFromApi.filename;
      } else {
        finalId = tempId; // Fallback to tempId if API doesn't provide a good one
        console.warn("[VideoContext] Upload API response missing string 'id' or 'filename'. Using tempId. Response:", uploadedVideoDataFromApi);
      }

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
        URL.revokeObjectURL(placeholderVideo.originalUrl); 
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
    
    let filenameForApi = video.filename; // This should be the key/filename for the API call
    let downloadName = `${type}_${video.name || video.filename}`;

    if (type === 'censored') {
        if (video.processedFilename) {
            filenameForApi = video.processedFilename;
            downloadName = video.processedFilename; 
        } else if (video.censoredUrl) {
            try {
                const urlParts = video.censoredUrl.split('/');
                filenameForApi = decodeURIComponent(urlParts[urlParts.length -1]);
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

    // Note: Backend should handle deleting both original and processed if applicable,
    // based on the primary filename/key. Frontend just informs which primary video to delete.
    try {
      await deleteVideoApi(filename, token); // Assumes backend handles associated processed file
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
      const response = await processVideoApi(videoToProcess.filename, token); // filename is the original S3 key
      console.log("[VideoContext] Process video API response:", response);
      setVideos(prev => prev.map(v => 
        v.id === videoToProcess.id ? { 
          ...v, 
          status: 'censored', 
          processedFilename: response.processed_filename,
          censoredUrl: `${apiBaseUrl}/videos/${encodeURIComponent(response.processed_filename)}`
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

