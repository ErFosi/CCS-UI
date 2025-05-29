
"use client";

import type { VideoAsset } from '@/lib/types';
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context';
import { listVideosApi, uploadVideoApi, getVideoApi, setPreferenceApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { isValid, parseISO, formatDistanceToNow } from 'date-fns';

// Helper to get base API URL, ensure this is consistent with apiClient.ts
const getApiBaseUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!apiUrl) {
    // This case should ideally be handled more gracefully or via a shared config
    return "http://localhost:0"; 
  }
  return apiUrl;
};

interface VideoContextType {
  videos: VideoAsset[];
  isLoading: boolean;
  error: string | null;
  fetchVideos: () => Promise<void>;
  uploadVideo: (file: File, originalName: string) => Promise<void>;
  downloadVideo: (video: VideoAsset, type: 'original' | 'censored') => Promise<void>; // Keep for explicit downloads
  // getVideoBlobUrl: (video: VideoAsset, type: 'original' | 'censored') => Promise<string | null>; // This will be handled in VideoCard
  setPreference: (key: string, value: any) => Promise<void>;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

export const VideoProvider = ({ children }: { children: ReactNode }) => {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getToken, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const fetchVideos = useCallback(async () => {
    if (!isAuthenticated) {
      console.log("[VideoContext] FetchVideos skipped: User not authenticated.");
      setVideos([]); // Clear videos if not authenticated
      return;
    }
    const token = await getToken();
    if (!token) {
      setError("Authentication token not available for fetching videos.");
      toast({ title: "Authentication Error", description: "Could not retrieve auth token.", variant: "destructive" });
      console.error("[VideoContext] FetchVideos: No token available.");
      return;
    }

    console.log("[VideoContext] Setting isLoading to true for fetchVideos.");
    setIsLoading(true);
    setError(null);
    try {
      console.log("[VideoContext] Fetching video filenames from API...");
      const filenamesFromApi = await listVideosApi(token); // This now returns string[]
      console.log("[VideoContext] Raw filenames fetched from API:", filenamesFromApi);

      const apiBaseUrl = getApiBaseUrl();

      const mappedVideos: VideoAsset[] = filenamesFromApi.map(filename => {
        // Construct VideoAsset objects from filenames
        // The API needs to provide more info (uploadDate, actual status) for richer objects
        // For now, we use placeholders.
        const videoAsset: VideoAsset = {
          id: filename, // Using filename as ID, might be better to get a unique ID from API if possible
          name: filename,
          filename: filename,
          // This uploadDate will be the fetch time. API should ideally provide actual upload date.
          uploadDate: new Date().toISOString(), 
          status: 'uploaded', // Assuming 'uploaded' if listed. API should provide actual status.
          originalUrl: `${apiBaseUrl}/videos/${encodeURIComponent(filename)}`, // URL to your FastAPI streaming endpoint
          // censoredUrl: `${apiBaseUrl}/videos/censored/${encodeURIComponent(filename)}`, // Example for censored
        };
        return videoAsset;
      }).sort((a, b) => {
        // Sort by name if uploadDate is placeholder, or by actual date if API provided it
        const dateA = a.uploadDate ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA; // Newest first
      });

      setVideos(mappedVideos);
      console.log("[VideoContext] Videos mapped and set successfully:", mappedVideos);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch videos";
      console.error("[VideoContext] Error fetching videos:", err);
      setError(errorMessage);
      toast({ title: "Failed to Load Videos", description: errorMessage, variant: "destructive" });
    } finally {
      console.log("[VideoContext] Setting isLoading to false for fetchVideos.");
      setIsLoading(false);
    }
  }, [getToken, isAuthenticated, toast]);


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
    const apiBaseUrl = getApiBaseUrl(); // Get base URL for constructing URLs

    const placeholderVideo: VideoAsset = {
      id: tempId,
      name: originalName,
      filename: originalName,
      uploadDate: new Date().toISOString(),
      status: 'uploading',
      // No originalUrl for placeholder initially, or could be a local blob URL if needed
    };
    setVideos(prev => [placeholderVideo, ...prev].sort((a, b) => {
        const dateA = a.uploadDate ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
    }));

    const formData = new FormData();
    formData.append('file', file, originalName);

    try {
      console.log(`[VideoContext] Uploading video: ${originalName} with tempId: ${tempId}`);
      // Assume uploadVideoApi returns a full VideoAsset-like object from your backend
      // including 'filename' or 'id' and ideally 'uploadDate', 'status'
      const uploadedVideoDataFromApi = await uploadVideoApi(formData, token);
      console.log("[VideoContext] Raw data from upload API:", uploadedVideoDataFromApi);
      
      const newVideo: VideoAsset = {
        id: uploadedVideoDataFromApi.id || tempId, // Use API ID if available
        name: uploadedVideoDataFromApi.name || originalName,
        filename: uploadedVideoDataFromApi.filename || originalName, // Essential for constructing URLs
        status: uploadedVideoDataFromApi.status || 'uploaded',
        originalUrl: uploadedVideoDataFromApi.filename ? `${apiBaseUrl}/videos/${encodeURIComponent(uploadedVideoDataFromApi.filename)}` : undefined,
        // censoredUrl: uploadedVideoDataFromApi.filename ? `${apiBaseUrl}/videos/censored/${encodeURIComponent(uploadedVideoDataFromApi.filename)}` : undefined,
        uploadDate: uploadedVideoDataFromApi.uploadDate || new Date().toISOString(),
        error: uploadedVideoDataFromApi.error,
      };

      setVideos(prev => prev.map(v => v.id === tempId ? newVideo : v)
                           .sort((a, b) => {
                                const dateA = a.uploadDate ? parseISO(a.uploadDate).getTime() : 0;
                                const dateB = b.uploadDate ? parseISO(b.uploadDate).getTime() : 0;
                                return dateB - dateA;
                           }));
      toast({ title: "Upload Successful", description: `${originalName} has been uploaded.`, variant: "default" });
      // Optionally call fetchVideos() if the API response isn't complete or if further processing happens server-side
      // await fetchVideos(); 
    } catch (errCatch) {
      const errorMessage = errCatch instanceof Error ? errCatch.message : "Failed to upload video";
      console.error(`[VideoContext] Error uploading video ${originalName}:`, errCatch);
      // setError(errorMessage); // This context-level error might be too broad
      setVideos(prev => prev.map(v => v.id === tempId ? { ...v, status: 'failed', error: errorMessage } : v)
                           .sort((a, b) => {
                                const dateA = a.uploadDate ? parseISO(a.uploadDate).getTime() : 0;
                                const dateB = b.uploadDate ? parseISO(b.uploadDate).getTime() : 0;
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
    
    // Use video.filename for the API call, which should be the key for S3 or your storage
    const filenameForApi = video.filename; 
    if (!filenameForApi) {
        toast({ title: "Download Error", description: "Video filename is missing for API call.", variant: "destructive" });
        console.error("[VideoContext] Download error: video.filename is missing for video:", video);
        return;
    }

    // For user-facing download name, prefer video.name
    const downloadName = `${type}_${video.name || filenameForApi}`;

    toast({ title: "Download Started", description: `Preparing to download ${downloadName}...` });
    try {
      // Construct the correct filename for the API. 
      // If 'type' (original/censored) implies a different filename or path for the API, adjust here.
      // For now, assuming 'filenameForApi' is correct for both, or that 'type' is handled by the backend.
      let apiFilename = filenameForApi;
      // if (type === 'censored' && video.censoredFilename) { // Example if you have distinct censored filenames
      //   apiFilename = video.censoredFilename;
      // }

      console.log(`[VideoContext] Calling getVideoApi for ${type} version of ${apiFilename}`);
      const blob = await getVideoApi(apiFilename, token); 
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
      const errorMessage = err instanceof Error ? err.message : `Failed to download ${type} video`;
      console.error(`[VideoContext] Error downloading ${type} video ${video.name}:`, err);
      toast({ title: "Download Failed", description: errorMessage, variant: "destructive" });
    }
  };
  
  const setPreference = async (key: string, value: any) => {
    if (!isAuthenticated) {
        toast({ title: "Authentication Required", description: "Please log in to set preferences.", variant: "destructive" });
        return;
    }
    const token = await getToken();
    if (!token) {
        toast({ title: "Authentication Error", description: "Could not retrieve auth token for preferences.", variant: "destructive" });
        return;
    }

    try {
      await setPreferenceApi({ key, value }, token);
      toast({ title: "Preference Saved", description: `Preference '${key}' updated.`, variant: "default" });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to save preference";
      console.error(`[VideoContext] Error setting preference ${key}:`, err);
      toast({ title: "Failed to Save Preference", description: errorMessage, variant: "destructive" });
    }
  };

  return (
    <VideoContext.Provider value={{ videos, isLoading, error, fetchVideos, uploadVideo, downloadVideo, setPreference }}>
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
