"use client";

import { useEffect, useState } from 'react';
import { VideoCard } from '@/components/videos/video-card';
import { useVideoContext } from '@/context/video-context';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PlusCircle, VideoOff, UploadCloud, Loader2 } from 'lucide-react'; 
import { UpgradePopup } from '@/components/premium/upgrade-popup';
import { useAuth } from '@/context/auth-context';

export default function MyVideosPage() {
  const { videos, fetchVideos, isLoading: videosLoading, error: videosError } = useVideoContext();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);

  useEffect(() => {
    const hasSeenPopup = localStorage.getItem('hasSeenSecureGuardAIUpgradePopup');
    if (!hasSeenPopup) {
      const timer = setTimeout(() => {
        setShowUpgradePopup(true);
        localStorage.setItem('hasSeenSecureGuardAIUpgradePopup', 'true');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      fetchVideos();
    }
  }, [isAuthenticated, authLoading, fetchVideos]);

  const handleClosePopup = () => {
    setShowUpgradePopup(false);
  };

  if (authLoading || videosLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-150px)] text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">{authLoading ? "Authenticating..." : "Loading videos..."}</p>
      </div>
    );
  }
  
  // Filter out processed videos
  const filteredVideos = videos.filter(video => !video.name.startsWith('processed_'));

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

        {videosError && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800" role="alert">
            <span className="font-medium">Error:</span> {videosError}
          </div>
        )}

        {!videosError && filteredVideos.length === 0 && !videosLoading && (
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
        )}

        {!videosError && filteredVideos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6 xl:grid-cols-2">
            {filteredVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}