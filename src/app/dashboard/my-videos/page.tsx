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

  // Show the upgrade popup only once on mount
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

  // Fetch videos once user is authenticated and not loading auth
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchVideos();
    }
  }, [isAuthenticated, authLoading, fetchVideos]);

  // Separate original and processed videos for filtering
  const originalVideos = videos.filter((v) => !v.name.startsWith("processed_"));
  const processedVideosMap = new Map(
    videos
      .filter((v) => v.name.startsWith("processed_"))
      .map((v) => [v.name.replace(/^processed_/, ""), v])
  );

  // When original videos change or no video selected yet, set default selection
  useEffect(() => {
    if (!selectedVideoId && originalVideos.length > 0) {
      setSelectedVideoId(originalVideos[0].id);
      setShowProcessed(false);
    }
  }, [originalVideos, selectedVideoId]);

  // Find selected original video object
  const selectedOriginalVideo = originalVideos.find((v) => v.id === selectedVideoId) || null;
  // Find matching processed video (if any)
  const selectedProcessedVideo = selectedOriginalVideo
    ? processedVideosMap.get(selectedOriginalVideo.name) || null
    : null;

  // Decide which video to show based on toggle and availability
  const videoToShow = showProcessed && selectedProcessedVideo ? selectedProcessedVideo : selectedOriginalVideo;

  // Handle popup close
  const handleClosePopup = () => setShowUpgradePopup(false);

  // Show loading spinner during auth or video fetching
  if (authLoading || videosLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-150px)] text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{authLoading ? "Authenticating..." : "Loading videos..."}</p>
      </div>
    );
  }

  // Show error if videos error
  if (videosError) {
    return (
      <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800" role="alert">
        <span className="font-medium">Error:</span> {videosError}
      </div>
    );
  }

  // Show empty state if no videos
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-4 border-2 border-dashed border-border rounded-lg bg-card">
        <VideoOff className="h-20 w-20 text-muted-foreground mb-6" />
        <h2 className="text-2xl font-semibold mb-2 text-foreground">No Videos Yet</h2>
        <p className="text-muted-foreground mb-6 max-w-md">
          It looks like you haven't uploaded or processed any videos. Get started by uploading your first video!
        </p>
        <Button asChild size="lg" className="!bg-primary hover:!bg-primary/90 text-primary-foreground">
          <Link href="/dashboard/upload">
            <UploadCloud className="mr-2 h-5 w-5" /> Upload Your First Video
          </Link>
        </Button>
      </div>
    );
  }

  // Main UI render
  return (
    <>
      <UpgradePopup isOpen={showUpgradePopup} onClose={handleClosePopup} />
      <div className="container mx-auto py-2">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">My Videos</h1>
          <Button asChild className="!bg-primary hover:!bg-primary/90 text-primary-foreground">
            <Link href="/dashboard/upload">
              <PlusCircle className="mr-2 h-5 w-5" /> Upload New Media
            </Link>
          </Button>
        </div>

        {/* Video selection tabs for original videos */}
        <div className="mb-4 flex flex-wrap gap-2">
          {originalVideos.map((video) => (
            <button
              key={video.id}
              className={`px-4 py-2 rounded ${
                selectedVideoId === video.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
              onClick={() => {
                setSelectedVideoId(video.id);
                setShowProcessed(false); // reset toggle when switching videos
              }}
            >
              {video.name}
            </button>
          ))}
        </div>

        {/* Show toggle if processed video exists for selected */}
        {selectedProcessedVideo && (
          <div className="mb-4 flex items-center gap-2">
            <label className="flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showProcessed}
                onChange={() => setShowProcessed((prev) => !prev)}
                className="mr-2"
              />
              Show Processed Version
            </label>
          </div>
        )}

        {/* Render selected video */}
        {videoToShow ? (
          <VideoCard video={videoToShow} />
        ) : (
          <div>No video to show.</div>
        )}
      </div>
    </>
  );
}
