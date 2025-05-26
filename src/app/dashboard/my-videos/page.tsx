
"use client";

import { useEffect, useState } from 'react';
import { VideoCard } from '@/components/videos/video-card';
import { useVideoContext } from '@/context/video-context';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PlusCircle, VideoOff, UploadCloud as UploadCloudIcon } from 'lucide-react'; // Renamed to avoid conflict
import { UpgradePopup } from '@/components/premium/upgrade-popup';

export default function MyVideosPage() {
  const { videos } = useVideoContext();
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);

  useEffect(() => {
    const hasSeenPopup = localStorage.getItem('hasSeenVideoReviveUpgradePopup');
    if (!hasSeenPopup) {
      // Small delay to ensure page is somewhat visible before popup
      const timer = setTimeout(() => {
        setShowUpgradePopup(true);
        localStorage.setItem('hasSeenVideoReviveUpgradePopup', 'true');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClosePopup = () => {
    setShowUpgradePopup(false);
  };

  return (
    <>
      <UpgradePopup isOpen={showUpgradePopup} onClose={handleClosePopup} />
      <div className="container mx-auto py-2">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">My Videos</h1>
          <Button asChild className="!bg-primary hover:!bg-primary/90 text-primary-foreground">
            <Link href="/dashboard/upload">
              <PlusCircle className="mr-2 h-5 w-5" /> Upload New Video
            </Link>
          </Button>
        </div>

        {videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-4 border-2 border-dashed border-border rounded-lg bg-card">
            <VideoOff className="h-20 w-20 text-muted-foreground mb-6" />
            <h2 className="text-2xl font-semibold mb-2 text-foreground">No Videos Yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              It looks like you haven't uploaded or upscaled any videos. Get started by uploading your first video!
            </p>
            <Button asChild size="lg" className="!bg-primary hover:!bg-primary/90 text-primary-foreground">
              <Link href="/dashboard/upload">
                <UploadCloudIcon className="mr-2 h-5 w-5" /> Upload Your First Video
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6 xl:grid-cols-2">
            {videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
