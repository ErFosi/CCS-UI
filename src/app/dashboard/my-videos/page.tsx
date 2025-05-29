"use client";

import { useEffect, useState } from "react";
import { VideoCard } from "@/components/videos/video-card";
import { useVideoContext } from "@/context/video-context";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusCircle, VideoOff, UploadCloud, Loader2 } from "lucide-react";
import { UpgradePopup } from "@/components/premium/upgrade-popup";
import { useAuth } from "@/context/auth-context";

export default function MyVideosPage() {
  const { videos, fetchVideos, isLoading: videosLoading, error: videosError } = useVideoContext();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showProcessed, setShowProcessed] = useState(false);

  // All useEffects here BEFORE any return

  useEffect(() => {
    const hasSeenPopup = localStorage.getItem("hasSeenSecureGuardAIUpgradePopup");
    if (!hasSeenPopup) {
      const timer = setTimeout(() => {
        setShowUpgradePopup(true);
        localStorage.setItem("hasSeenSecureGuardAIUpgradePopup", "true");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchVideos();
    }
  }, [isAuthenticated, authLoading, fetchVideos]);

  // Separate original and processed videos
  const originalVideos = videos.filter((v) => !v.name.startsWith("processed_"));
  const processedVideosMap = new Map(
    videos
      .filter((v) => v.name.startsWith("processed_"))
      .map((v) => [v.name.replace(/^processed_/, ""), v])
  );

  useEffect(() => {
    if (!selectedVideoId && originalVideos.length > 0) {
      setSelectedVideoId(originalVideos[0].id);
      setShowProcessed(false);
    }
  }, [selectedVideoId, originalVideos]);

  const selectedOriginalVideo = originalVideos.find((v) => v.id === selectedVideoId);
  const selectedProcessedVideo = selectedOriginalVideo
    ? processedVideosMap.get(selectedOriginalVideo.name)
    : null;

  const videoToShow = showProcessed && selectedProcessedVideo ? selectedProcessedVideo : selectedOriginalVideo;

  // Now early returns after hooks:

  if (authLoading || videosLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-150px)] text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{authLoading ? "Authenticating..." : "Loading videos..."}</p>
      </div>
    );
  }

  if (!videoToShow) {
    return (
      <div className="text-center py-16">
        <p>No videos to display.</p>
      </div>
    );
  }

  return (
    <>
      <UpgradePopup isOpen={showUpgradePopup} onClose={() => setShowUpgradePopup(false)} />
      <div className="container mx-auto py-2">
        {/* UI content here */}
      </div>
    </>
  );
}