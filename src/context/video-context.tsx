
"use client";

import type { VideoAsset } from '@/lib/types';
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context';
import { listVideosApi, uploadVideoApi, getVideoApi, setPreferenceApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';
import { isValid, parseISO, formatDistanceToNow } from 'date-fns'; // Import for date checking

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
      console.log("[VideoContext] Fetching videos from API...");
      const fetchedVideosFromApi = await listVideosApi(token);
      console.log("[VideoContext] Raw videos fetched from API:", fetchedVideosFromApi);

      const mappedVideos = fetchedVideosFromApi.map(apiVideo => {
        // CRITICAL: Ensure your API response includes a field with the direct video URL.
        // Map it to `originalUrl` here. Example: apiVideo.url, apiVideo.video_url, etc.
        // Also ensure `uploadDate` is a valid ISO string.
        let validUploadDate = apiVideo.uploadDate;
        if (validUploadDate) {
          try {
            if (!isValid(parseISO(validUploadDate))) {
              console.warn(`[VideoContext] Invalid uploadDate format from API for video ID ${apiVideo.id}: ${validUploadDate}. Setting to undefined.`);
              validUploadDate = undefined;
            }
          } catch (e) {
            console.warn(`[VideoContext] Error parsing uploadDate from API for video ID ${apiVideo.id}: ${validUploadDate}. Setting to undefined.`, e);
            validUploadDate = undefined;
          }
        }

        return {
          ...apiVideo, // Spread other fields from API if they match VideoAsset
          id: apiVideo.id || crypto.randomUUID(), // Ensure ID exists
          name: apiVideo.name || apiVideo.filename || "Unnamed Video",
          filename: apiVideo.filename || apiVideo.name,
          originalUrl: apiVideo.originalUrl || (apiVideo as any).url || (apiVideo as any).video_url, // IMPORTANT MAPPING
          censoredUrl: apiVideo.censoredUrl || (apiVideo as any).censored_video_url, // IMPORTANT MAPPING
          uploadDate: validUploadDate,
          status: apiVideo.status || 'uploaded',
        } as VideoAsset;
      }).sort((a, b) => {
        const dateA = a.uploadDate ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
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
    const placeholderVideo: VideoAsset = {
      id: tempId,
      name: originalName,
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
      const uploadedVideoDataFromApi = await uploadVideoApi(formData, token);
      console.log("[VideoContext] Raw data from upload API:", uploadedVideoDataFromApi);
      
      // CRITICAL: Ensure your API response from /upload includes the direct video URL.
      // Map it to `originalUrl` here.
      const newVideo: VideoAsset = {
        ...uploadedVideoDataFromApi,
        id: uploadedVideoDataFromApi.id || tempId,
        name: uploadedVideoDataFromApi.name || originalName,
        filename: uploadedVideoDataFromApi.filename || originalName,
        status: uploadedVideoDataFromApi.status || 'uploaded', // Or 'processing' if backend indicates
        originalUrl: uploadedVideoDataFromApi.originalUrl || (uploadedVideoDataFromApi as any).url || (uploadedVideoDataFromApi as any).video_url, // IMPORTANT MAPPING
        uploadDate: uploadedVideoDataFromApi.uploadDate || new Date().toISOString(),
      };

      setVideos(prev => prev.map(v => v.id === tempId ? newVideo : v)
                           .sort((a, b) => {
                                const dateA = a.uploadDate ? parseISO(a.uploadDate).getTime() : 0;
                                const dateB = b.uploadDate ? parseISO(b.uploadDate).getTime() : 0;
                                return dateB - dateA;
                           }));
      toast({ title: "Upload Successful", description: `${originalName} has been uploaded. Processing may take some time.`, variant: "default" });
      // Optionally call fetchVideos() if the API response isn't complete or status changes server-side.
      // await fetchVideos(); 
    } catch (errCatch) {
      const errorMessage = errCatch instanceof Error ? errCatch.message : "Failed to upload video";
      console.error(`[VideoContext] Error uploading video ${originalName}:`, errCatch);
      setError(errorMessage); // Set context-level error
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
    
    const filenameForApi = video.filename || video.name; 
    if (!filenameForApi) {
        toast({ title: "Download Error", description: "Video filename is missing.", variant: "destructive" });
        return;
    }

    const downloadName = `${type}_${video.name || filenameForApi}`;

    toast({ title: "Download Started", description: `Preparing to download ${downloadName}...` });
    try {
      console.log(`[VideoContext] Calling getVideoApi for ${type} version of ${filenameForApi}`);
      const blob = await getVideoApi(filenameForApi, token, type); 
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

    