"use client";

import type { VideoAsset } from '@/lib/types';
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

interface VideoContextType {
  videos: VideoAsset[];
  addVideo: (video: VideoAsset) => void;
  updateVideoStatus: (id: string, status: VideoAsset['status'], upscaledDataUri?: string, error?: string) => void;
  getVideoById: (id: string) => VideoAsset | undefined;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'videoReviveAppVideos';

export const VideoProvider = ({ children }: { children: ReactNode }) => {
  const [videos, setVideos] = useState<VideoAsset[]>(() => {
    if (typeof window !== 'undefined') {
      const savedVideos = localStorage.getItem(LOCAL_STORAGE_KEY);
      return savedVideos ? JSON.parse(savedVideos) : [];
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(videos));
    }
  }, [videos]);

  const addVideo = (video: VideoAsset) => {
    setVideos((prevVideos) => [video, ...prevVideos]);
  };

  const updateVideoStatus = (id: string, status: VideoAsset['status'], upscaledDataUri?: string, error?: string) => {
    setVideos((prevVideos) =>
      prevVideos.map((v) =>
        v.id === id ? { ...v, status, upscaledDataUri: upscaledDataUri ?? v.upscaledDataUri, error: error ?? v.error } : v
      )
    );
  };

  const getVideoById = (id:string) => {
    return videos.find(v => v.id === id);
  }

  return (
    <VideoContext.Provider value={{ videos, addVideo, updateVideoStatus, getVideoById }}>
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
