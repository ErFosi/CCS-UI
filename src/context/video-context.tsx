
"use client";

import type { VideoAsset } from '@/lib/types';
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context';
import { listVideosApi, uploadVideoApi, getVideoApi, setPreferenceApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

interface VideoContextType {
  videos: VideoAsset[];
  isLoading: boolean;
  error: string | null;
  fetchVideos: () => Promise<void>;
  uploadVideo: (file: File, originalName: string) => Promise<void>;
  downloadVideo: (video: VideoAsset, type: 'original' | 'censored') => Promise<void>; // Added type
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
    if (!isAuthenticated) return;
    const token = await getToken();
    if (!token) {
      setError("Authentication token not available for fetching videos.");
      toast({ title: "Authentication Error", description: "Could not retrieve auth token.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      console.log("[VideoContext] Fetching videos from API...");
      const fetchedVideosFromApi = await listVideosApi(token);
      // Ensure API response is correctly mapped to VideoAsset[]
      // This assumes fetchedVideosFromApi directly matches VideoAsset[] or needs minimal mapping
      // For example, if your API returns `video_url` instead of `originalUrl`, map it here.
      const mappedVideos = fetchedVideosFromApi.map(apiVideo => ({
        ...apiVideo,
        // Example mapping: Ensure fields expected by frontend are present
        // originalUrl: apiVideo.original_url || apiVideo.originalUrl, 
        // censoredUrl: apiVideo.censored_url || apiVideo.censoredUrl,
        // uploadDate: apiVideo.upload_date || apiVideo.uploadDate,
      }));
      setVideos(mappedVideos);
      console.log("[VideoContext] Videos fetched successfully:", mappedVideos);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch videos";
      console.error("[VideoContext] Error fetching videos:", err);
      setError(errorMessage);
      toast({ title: "Failed to Load Videos", description: errorMessage, variant: "destructive" });
    } finally {
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
    setVideos(prev => [placeholderVideo, ...prev].sort((a, b) => new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime()));


    const formData = new FormData();
    formData.append('file', file, originalName);

    try {
      console.log(`[VideoContext] Uploading video: ${originalName} with tempId: ${tempId}`);
      const uploadedVideoData = await uploadVideoApi(formData, token);
      
      // Ensure the response from uploadVideoApi matches VideoAsset structure
      // or map it appropriately here.
      const newVideo: VideoAsset = {
        ...uploadedVideoData, // Spread the API response
        id: uploadedVideoData.id || tempId, // Use API ID if available
        name: uploadedVideoData.name || originalName,
        status: uploadedVideoData.status || 'uploaded', // Or 'processing'
        // originalUrl: uploadedVideoData.original_url || uploadedVideoData.originalUrl,
        // censoredUrl: uploadedVideoData.censored_url || uploadedVideoData.censoredUrl,
        // uploadDate: uploadedVideoData.upload_date || uploadedVideoData.uploadDate || new Date().toISOString(),
      };

      setVideos(prev => prev.map(v => v.id === tempId ? newVideo : v)
                           .sort((a, b) => new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime()));
      toast({ title: "Upload Successful", description: `${originalName} has been processed.`, variant: "default" });
      // Optionally call fetchVideos() again if the API response for upload isn't complete
      // or if further processing happens server-side that needs to be reflected.
      // await fetchVideos(); 
    } catch (errCatch) {
      const errorMessage = errCatch instanceof Error ? errCatch.message : "Failed to upload video";
      console.error(`[VideoContext] Error uploading video ${originalName}:`, errCatch);
      setVideos(prev => prev.map(v => v.id === tempId ? { ...v, status: 'failed', error: errorMessage } : v)
                           .sort((a, b) => new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime()));
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
    
    // Use the video's `filename` if available, otherwise fall back to `name`.
    // This assumes your API's /videos/{filename} endpoint uses what's stored in `video.filename` or `video.name`.
    const filenameForApi = video.filename || video.name; 
    if (!filenameForApi) {
        toast({ title: "Download Error", description: "Video filename is missing.", variant: "destructive" });
        return;
    }

    // Construct a download name based on type
    const downloadName = `${type}_${video.name || filenameForApi}`;

    toast({ title: "Download Started", description: `Preparing to download ${downloadName}...` });
    try {
      // The getVideoApi should ideally handle fetching the correct version (original/censored)
      // If your API has different endpoints for original and censored, you'll need two API client functions.
      // For now, assuming getVideoApi fetches the 'original' by default if type isn't part of its path.
      // If your API needs the type, you'd modify getVideoApi or have separate functions.
      // Let's assume for now getVideoApi fetches based on the filename provided,
      // and the distinction is handled by which URL is stored in VideoAsset (originalUrl vs censoredUrl)
      // if direct download from URL is possible.
      // If API call is always needed, then the API endpoint itself must know which version.
      
      // This function is for when an API call is needed to get the Blob.
      // If video.originalUrl/censoredUrl is present, VideoCard handles direct link download.
      console.log(`[VideoContext] Calling getVideoApi for ${type} version of ${filenameForApi}`);
      const blob = await getVideoApi(filenameForApi, token, type); // Pass type to API client if it supports it
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
