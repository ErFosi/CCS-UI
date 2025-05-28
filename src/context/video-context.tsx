
"use client";

import type { VideoAsset } from '@/lib/types';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { useAuth } from './auth-context';
import { listVideosApi, uploadVideoApi, getVideoApi, setPreferenceApi } from '@/lib/apiClient'; // Assuming apiClient.ts is in src/lib
import { useToast } from '@/hooks/use-toast';

interface VideoContextType {
  videos: VideoAsset[];
  isLoading: boolean;
  error: string | null;
  fetchVideos: () => Promise<void>;
  uploadVideo: (file: File, originalName: string) => Promise<void>;
  downloadVideo: (video: VideoAsset) => Promise<void>;
  setPreference: (key: string, value: any) => Promise<void>;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'secureGuardAIVideos_v2'; // Updated key if structure changes

export const VideoProvider = ({ children }: { children: ReactNode }) => {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getToken, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Load videos from local storage initially (optional, API is source of truth)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedVideos = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedVideos) {
        // setVideos(JSON.parse(savedVideos)); // Consider if this is needed or if API is always primary
      }
    }
  }, []);

  // Save videos to local storage (optional)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(videos));
    }
  }, [videos]);

  const fetchVideos = useCallback(async () => {
    if (!isAuthenticated) {
      // setError("User not authenticated. Cannot fetch videos.");
      // toast({ title: "Authentication Required", description: "Please log in to see your videos.", variant: "destructive" });
      return;
    }
    const token = await getToken();
    if (!token) {
      setError("Authentication token not available.");
      toast({ title: "Authentication Error", description: "Could not retrieve auth token.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      console.log("[VideoContext] Fetching videos from API...");
      const fetchedVideos = await listVideosApi(token);
      setVideos(fetchedVideos);
      console.log("[VideoContext] Videos fetched successfully:", fetchedVideos);
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
    setVideos(prev => [placeholderVideo, ...prev]);

    const formData = new FormData();
    formData.append('file', file, originalName); // FastAPI expects 'file'

    try {
      console.log(`[VideoContext] Uploading video: ${originalName} with tempId: ${tempId}`);
      const uploadedVideoData = await uploadVideoApi(formData, token); // Assuming API returns the new VideoAsset
      
      // Replace placeholder with actual data from API response
      setVideos(prev => prev.map(v => v.id === tempId ? { ...uploadedVideoData, status: uploadedVideoData.status || 'uploaded' } : v));
      toast({ title: "Upload Successful", description: `${originalName} has been uploaded.`, variant: "default" });
      
      // Optionally, re-fetch all videos to ensure consistency if API response is minimal
      // await fetchVideos(); 

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to upload video";
      console.error(`[VideoContext] Error uploading video ${originalName}:`, err);
      setVideos(prev => prev.map(v => v.id === tempId ? { ...v, status: 'failed', error: errorMessage } : v));
      toast({ title: "Upload Failed", description: errorMessage, variant: "destructive" });
    }
  };

  const downloadVideo = async (video: VideoAsset) => {
    if (!isAuthenticated) {
        toast({ title: "Authentication Required", description: "Please log in to download videos.", variant: "destructive" });
        return;
    }
    const token = await getToken();
    if (!token) {
        toast({ title: "Authentication Error", description: "Could not retrieve auth token for download.", variant: "destructive" });
        return;
    }
    
    // Use video.filename if available and different from video.name, otherwise use video.name
    const filenameForApi = video.filename || video.name;
    if (!filenameForApi) {
        toast({ title: "Download Error", description: "Video filename is missing.", variant: "destructive" });
        return;
    }

    toast({ title: "Download Started", description: `Preparing to download ${video.name}...` });
    try {
      const blob = await getVideoApi(filenameForApi, token);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = video.name || 'downloaded_video.mp4'; // Fallback filename
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Download Complete", description: `${video.name} downloaded.`, variant: "default" });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download video";
      console.error(`[VideoContext] Error downloading video ${video.name}:`, err);
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
