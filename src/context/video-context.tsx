
"use client";

import type { VideoAsset } from '@/lib/types';
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context';
import { listVideosApi, uploadVideoApi, getVideoApi, setPreferenceApi, getApiBaseUrl } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { isValid, parseISO, formatDistanceToNow } from 'date-fns';

interface VideoContextType {
  videos: VideoAsset[];
  isLoading: boolean;
  error: string | null;
  fetchVideos: () => Promise<void>;
  uploadVideo: (file: File, originalName: string) => Promise<void>;
  downloadVideo: (video: VideoAsset, type: 'original' | 'censored') => Promise<void>;
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
      setVideos([]);
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
      const rawVideosFromApi: any[] = await listVideosApi(token); // Assuming API returns array of video-like objects
      console.log("[VideoContext] Raw videos fetched from API:", JSON.stringify(rawVideosFromApi, null, 2));

      const apiBaseUrl = getApiBaseUrl();

      const mappedVideos: VideoAsset[] = rawVideosFromApi.map((apiVideo: any, index: number) => {
        let uniqueId: string;
        // Prioritize string 'id', then string 'filename', then UUID
        if (apiVideo && typeof apiVideo.id === 'string' && apiVideo.id.trim() !== '') {
          uniqueId = apiVideo.id;
        } else if (apiVideo && typeof apiVideo.filename === 'string' && apiVideo.filename.trim() !== '') {
          uniqueId = apiVideo.filename; 
        } else {
          console.warn(`[VideoContext] Video item at index ${index} has invalid/missing 'id' and 'filename' for key. Assigning fallback UUID. Item data:`, JSON.stringify(apiVideo));
          uniqueId = crypto.randomUUID();
        }
        
        // Ensure uniqueId is definitely a string, even if somehow the above logic fails (defensive)
        if (typeof uniqueId !== 'string') {
            console.error("[VideoContext] CRITICAL: uniqueId is NOT a string after assignment logic. Forcing UUID. Value:", uniqueId, "Original API video:", apiVideo);
            uniqueId = crypto.randomUUID();
        }

        return {
          id: uniqueId,
          name: apiVideo.name || apiVideo.filename || `Video ${index + 1}`,
          filename: apiVideo.filename || apiVideo.name,
          // IMPORTANT MAPPING: Ensure your API response has a field for originalUrl or map it correctly here
          originalUrl: apiVideo.originalUrl || (apiVideo.filename ? `${apiBaseUrl}/videos/${encodeURIComponent(apiVideo.filename)}` : undefined),
          // censoredUrl: apiVideo.censoredUrl || (apiVideo.filename ? `${apiBaseUrl}/videos/censored/${encodeURIComponent(apiVideo.filename)}` : undefined),
          uploadDate: apiVideo.uploadDate || new Date().toISOString(), // Ensure your API provides this in ISO format
          status: apiVideo.status || 'uploaded', // Ensure your API provides this
          error: apiVideo.error,
          originalWidth: apiVideo.originalWidth,
          originalHeight: apiVideo.originalHeight,
        };
      }).sort((a, b) => {
        const dateA = a.uploadDate ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
      });

      console.log("[VideoContext] Videos mapped and set successfully:", JSON.stringify(mappedVideos, null, 2));
      setVideos(mappedVideos);
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
    const apiBaseUrl = getApiBaseUrl();

    const placeholderVideo: VideoAsset = {
      id: tempId,
      name: originalName,
      filename: originalName,
      uploadDate: new Date().toISOString(),
      status: 'uploading',
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
      // Assuming uploadVideoApi returns a full VideoAsset-like object from your backend
      const uploadedVideoDataFromApi: any = await uploadVideoApi(formData, token);
      console.log("[VideoContext] Raw data from upload API:", JSON.stringify(uploadedVideoDataFromApi, null, 2));
      
      let finalId: string;
      if (uploadedVideoDataFromApi && typeof uploadedVideoDataFromApi.id === 'string' && uploadedVideoDataFromApi.id.trim() !== '') {
        finalId = uploadedVideoDataFromApi.id;
      } else if (uploadedVideoDataFromApi && typeof uploadedVideoDataFromApi.filename === 'string' && uploadedVideoDataFromApi.filename.trim() !== '') {
        finalId = uploadedVideoDataFromApi.filename;
      } else {
        console.warn(`[VideoContext] Upload API response missing or invalid 'id' and 'filename', using tempId. API response:`, JSON.stringify(uploadedVideoDataFromApi));
        finalId = tempId;
      }

      // Ensure finalId is definitely a string
      if (typeof finalId !== 'string') {
        console.error("[VideoContext] CRITICAL: finalId for uploaded video is NOT a string. Forcing tempId. Value:", finalId, "Original API response:", uploadedVideoDataFromApi);
        finalId = tempId;
      }
      
      const newVideo: VideoAsset = {
        id: finalId,
        name: uploadedVideoDataFromApi.name || originalName,
        filename: uploadedVideoDataFromApi.filename || originalName,
        status: uploadedVideoDataFromApi.status || 'uploaded',
        // IMPORTANT MAPPING: Ensure your API response has a field for originalUrl or map it correctly here
        originalUrl: uploadedVideoDataFromApi.originalUrl || (uploadedVideoDataFromApi.filename ? `${apiBaseUrl}/videos/${encodeURIComponent(uploadedVideoDataFromApi.filename)}` : undefined),
        // censoredUrl: uploadedVideoDataFromApi.censoredUrl || (uploadedVideoDataFromApi.filename ? `${apiBaseUrl}/videos/censored/${encodeURIComponent(uploadedVideoDataFromApi.filename)}` : undefined),
        uploadDate: uploadedVideoDataFromApi.uploadDate || new Date().toISOString(),
        error: uploadedVideoDataFromApi.error,
        originalWidth: uploadedVideoDataFromApi.originalWidth,
        originalHeight: uploadedVideoDataFromApi.originalHeight,
      };

      console.log("[VideoContext] New video object after upload:", JSON.stringify(newVideo, null, 2));
      setVideos(prev => prev.map(v => v.id === tempId ? newVideo : v)
                           .sort((a, b) => {
                                const dateA = a.uploadDate ? parseISO(a.uploadDate).getTime() : 0;
                                const dateB = b.uploadDate ? parseISO(b.uploadDate).getTime() : 0;
                                return dateB - dateA;
                           }));
      toast({ title: "Upload Successful", description: `${originalName} has been uploaded.`, variant: "default" });
    } catch (errCatch) {
      const error = errCatch as Error; // Type assertion
      const errorMessage = error.message || "Failed to upload video";
      console.error(`[VideoContext] Error uploading video ${originalName}:`, error);
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
    
    const filenameForApi = video.filename; 
    if (!filenameForApi) {
        toast({ title: "Download Error", description: "Video filename is missing for API call.", variant: "destructive" });
        console.error("[VideoContext] Download error: video.filename is missing for video:", video);
        return;
    }

    const downloadName = `${type}_${video.name || filenameForApi}`;

    toast({ title: "Download Started", description: `Preparing to download ${downloadName}...` });
    try {
      let apiFilename = filenameForApi;
      // TODO: Adjust 'apiFilename' or the API path if original vs censored requires different identifiers for getVideoApi
      // For example, if censored videos have a suffix or are at a different path.
      // If type is 'censored' and your API distinguishes them, you'll need to modify apiFilename or the API call.
      // For now, we assume getVideoApi(filename, token) gets the original. If you have a specific censored version URL,
      // the VideoCard might directly use that.

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
      const error = err as Error;
      const errorMessage = error.message || `Failed to download ${type} video`;
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
      const error = err as Error;
      const errorMessage = error.message || "Failed to save preference";
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

    