
"use client";

import type { VideoAsset } from '@/lib/types';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { useAuth } from './auth-context';
import { listVideosApi, uploadVideoApi, getVideoApi, setPreferenceApi } from '@/lib/apiClient';
import { useToast } from '@/hooks/use-toast';

interface VideoContextType {
  videos: VideoAsset[];
  isLoading: boolean;
  error: string | null; // General context error, less used now for individual ops
  fetchVideos: () => Promise<void>;
  uploadVideo: (file: File, originalName: string) => Promise<void>;
  downloadVideo: (video: VideoAsset) => Promise<void>;
  setPreference: (key: string, value: any) => Promise<void>;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

export const VideoProvider = ({ children }: { children: ReactNode }) => {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false); // Primarily for initial fetchVideos
  const [error, setError] = useState<string | null>(null); // General context error
  const { getToken, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const fetchVideos = useCallback(async () => {
    if (!isAuthenticated) {
      // setError("User not authenticated. Cannot fetch videos.");
      // toast({ title: "Authentication Required", description: "Please log in to see your videos.", variant: "destructive" });
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
    formData.append('file', file, originalName);

    try {
      console.log(`[VideoContext] Uploading video: ${originalName} with tempId: ${tempId}`);
      const uploadedVideoData = await uploadVideoApi(formData, token);
      
      setVideos(prev => prev.map(v => v.id === tempId ? { ...uploadedVideoData, status: uploadedVideoData.status || 'uploaded' } : v));
      toast({ title: "Upload Successful", description: `${originalName} has been processed by the server.`, variant: "default" });
      // Optionally, re-fetch all videos to ensure consistency if API response is minimal or further processing happens
      // await fetchVideos(); 

    } catch (errCatch) {
      const errorMessage = errCatch instanceof Error ? errCatch.message : "Failed to upload video";
      console.error(`[VideoContext] Error uploading video ${originalName}:`, errCatch);
      // Update placeholder with error status
      setVideos(prev => prev.map(v => v.id === tempId ? { ...v, status: 'failed', error: errorMessage } : v));
      toast({ title: "Upload Failed", description: errorMessage, variant: "destructive" });
      // Re-throw the error if the calling component needs to handle it further
      // throw errCatch; 
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
