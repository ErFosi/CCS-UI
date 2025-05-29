
"use client";

import type { VideoAsset } from '@/lib/types';
import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context';
import { listVideosApi, uploadVideoApi, getVideoApi, deleteVideoApi, getApiBaseUrl } from '@/lib/apiClient'; // Removed setPreferenceApi for now
import { useToast } from '@/hooks/use-toast';
import { isValid, parseISO } from 'date-fns';

interface VideoContextType {
  videos: VideoAsset[];
  isLoading: boolean;
  error: string | null;
  fetchVideos: () => Promise<void>;
  uploadVideo: (file: File, originalName: string) => Promise<void>;
  downloadVideo: (video: VideoAsset, type: 'original' | 'censored') => Promise<void>; // type can be used if API differentiates
  deleteVideo: (videoId: string, filename: string) => Promise<void>;
  // setPreference: (key: string, value: any) => Promise<void>; // Kept for future use if needed
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
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const rawVideosFromApi = await listVideosApi(token);
      console.log("[VideoContext] Raw videos fetched from API:", JSON.stringify(rawVideosFromApi, null, 2));
      
      const apiBaseUrl = getApiBaseUrl();

      // Assuming rawVideosFromApi is an array of objects matching VideoAsset or adaptable to it
      const mappedVideos: VideoAsset[] = rawVideosFromApi.map((apiVideo: any) => {
        let uniqueId: string;
        // Prioritize string 'id', then string 'filename' from API, then construct if needed
        if (apiVideo && typeof apiVideo.id === 'string' && apiVideo.id.trim() !== '') {
          uniqueId = apiVideo.id;
        } else if (apiVideo && typeof apiVideo.filename === 'string' && apiVideo.filename.trim() !== '') {
          uniqueId = apiVideo.filename; // Use filename as ID if no explicit ID from API
        } else {
          // Fallback if API doesn't give a clear ID. This should be rare if API is well-designed.
          uniqueId = apiVideo.name || crypto.randomUUID(); 
        }
        
        return {
          id: uniqueId,
          name: apiVideo.name || apiVideo.filename || "Untitled Video",
          filename: apiVideo.filename || apiVideo.name, // Critical: This should be the name S3 uses (e.g. "video.mp4")
          originalUrl: apiVideo.originalUrl || (apiVideo.filename ? `${apiBaseUrl}/videos/${encodeURIComponent(apiVideo.filename)}` : undefined),
          // censoredUrl needs similar mapping if your API provides it
          censoredUrl: apiVideo.censoredUrl || (apiVideo.filename ? `${apiBaseUrl}/videos/censored/${encodeURIComponent(apiVideo.filename)}` : undefined),
          uploadDate: apiVideo.uploadDate || new Date().toISOString(), // API should provide ISO string
          status: apiVideo.status || 'uploaded', // API should provide status
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

    const tempId = crypto.randomUUID(); // For optimistic UI update
    const apiBaseUrl = getApiBaseUrl();

    const placeholderVideo: VideoAsset = {
      id: tempId,
      name: originalName,
      filename: originalName, // Assume filename is originalName initially
      uploadDate: new Date().toISOString(),
      status: 'uploading',
    };
    setVideos(prev => [placeholderVideo, ...prev].sort((a, b) => {
        const dateA = a.uploadDate && isValid(parseISO(a.uploadDate)) ? parseISO(a.uploadDate).getTime() : 0;
        const dateB = b.uploadDate && isValid(parseISO(b.uploadDate)) ? parseISO(b.uploadDate).getTime() : 0;
        return dateB - dateA;
    }));

    const formData = new FormData();
    formData.append('file', file, originalName);

    try {
      const uploadedVideoDataFromApi = await uploadVideoApi(formData, token); // API returns VideoAsset
      console.log("[VideoContext] Raw data from upload API:", JSON.stringify(uploadedVideoDataFromApi, null, 2));
      
      const finalId = uploadedVideoDataFromApi.id || uploadedVideoDataFromApi.filename || tempId;
      
      const newVideo: VideoAsset = {
        ...uploadedVideoDataFromApi, // Spread the API response
        id: finalId, // Ensure ID is consistent
        name: uploadedVideoDataFromApi.name || originalName,
        filename: uploadedVideoDataFromApi.filename || originalName, // Ensure filename is correctly set
        // Construct URLs if not provided by API, or use what API returns
        originalUrl: uploadedVideoDataFromApi.originalUrl || (uploadedVideoDataFromApi.filename ? `${apiBaseUrl}/videos/${encodeURIComponent(uploadedVideoDataFromApi.filename)}` : undefined),
        censoredUrl: uploadedVideoDataFromApi.censoredUrl, // Or construct similarly
        status: uploadedVideoDataFromApi.status || 'uploaded', // API should confirm status
      };

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
      setVideos(prev => prev.map(v => v.id === tempId ? { ...v, status: 'failed', error: errorMessage } : v)
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
    
    // Use video.filename which should be the key for the API (e.g., "example.mp4")
    const filenameForApi = video.filename; 
    if (!filenameForApi) {
        toast({ title: "Download Error", description: "Video filename is missing.", variant: "destructive" });
        return;
    }

    // TODO: Differentiate URL if API needs it for original vs censored for download
    let apiPathSuffix = filenameForApi;
    if (type === 'censored' && video.censoredUrl && video.censoredUrl.includes('/censored/')) {
      // If censoredUrl has a specific path, potentially adjust.
      // This part is tricky if only filename is used for getVideoApi for both.
      // For now, assuming getVideoApi(filename) gets the primary/original file.
    }
    
    const downloadName = `${type}_${video.name || filenameForApi}`;

    toast({ title: "Download Started", description: `Preparing to download ${downloadName}...` });
    try {
      const blob = await getVideoApi(apiPathSuffix, token); 
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
  

  // const setPreference = async (key: string, value: any) => { ... }; // Kept for future

  return (
    <VideoContext.Provider value={{ videos, isLoading, error, fetchVideos, uploadVideo, downloadVideo, deleteVideo }}>
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
