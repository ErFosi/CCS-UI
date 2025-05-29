
"use client";

import type { VideoAsset } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from './video-player';
import { Download, Clock, AlertTriangle, CheckCircle2, Video, Loader2, PlayCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { useVideoContext } from '@/context/video-context';
import { useAuth } from '@/context/auth-context';
import { getVideoApi } from '@/lib/apiClient';
import React, { useEffect, useState, useCallback } from 'react';

interface VideoCardProps {
  video: VideoAsset;
}

export function VideoCard({ video }: VideoCardProps) {
  const { downloadVideo } = useVideoContext(); // For explicit download button
  const { getToken } = useAuth();

  const [originalPlayerSrc, setOriginalPlayerSrc] = useState<string | null>(null);
  const [censoredPlayerSrc, setCensoredPlayerSrc] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Log video data for debugging
  useEffect(() => {
    console.log("[VideoCard] Received video data:", video);
  }, [video]);

  const loadVideoForPreview = useCallback(async (videoUrl: string | undefined, videoFilename: string | undefined, setSrc: (url: string | null) => void) => {
    if (!videoUrl || !videoFilename) {
      setSrc(null); // No URL or filename to fetch
      console.log(`[VideoCard] loadVideoForPreview: Missing videoUrl or videoFilename for ${video.name}`);
      return;
    }

    // If videoUrl is already a data URI or a direct public URL that doesn't need auth,
    // you could use it directly. However, assuming videoUrl from context is the API endpoint.
    
    setIsLoadingPreview(true);
    setPreviewError(null);
    setSrc(null); // Clear previous src

    const token = await getToken();
    if (!token) {
      console.error("[VideoCard] No token available to fetch video preview for:", videoFilename);
      setPreviewError("Authentication token not available.");
      setIsLoadingPreview(false);
      return;
    }

    try {
      console.log(`[VideoCard] Fetching video blob for preview: ${videoFilename}`);
      // Use video.filename which should be the S3 key or unique identifier for the API
      const blob = await getVideoApi(videoFilename, token);
      const objectUrl = URL.createObjectURL(blob);
      console.log(`[VideoCard] Created blob URL for ${videoFilename}: ${objectUrl}`);
      setSrc(objectUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load video preview";
      console.error(`[VideoCard] Error fetching video blob for ${videoFilename}:`, err);
      setPreviewError(errorMessage);
      setSrc(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [getToken, video.name]); // video.name for logging context

  // Effect to load original video preview
  useEffect(() => {
    let currentOriginalSrc: string | null = null;
    
    if (video.status !== 'uploading' && video.originalUrl && video.filename) {
        // Only attempt to load if it's not already a blob URL (to avoid re-fetching)
        // and if an originalUrl (API endpoint) and filename are present.
        if (!originalPlayerSrc?.startsWith('blob:')) {
             loadVideoForPreview(video.originalUrl, video.filename, (src) => {
                setOriginalPlayerSrc(src);
                currentOriginalSrc = src;
             });
        }
    } else {
        setOriginalPlayerSrc(null); // Clear if no valid URL or if uploading
    }

    return () => {
      if (currentOriginalSrc && currentOriginalSrc.startsWith('blob:')) {
        console.log(`[VideoCard] Revoking original object URL: ${currentOriginalSrc} for ${video.name}`);
        URL.revokeObjectURL(currentOriginalSrc);
      }
    };
  }, [video.originalUrl, video.filename, video.status, video.id, loadVideoForPreview, originalPlayerSrc]);


  // Effect to load censored video preview (if available)
  useEffect(() => {
    let currentCensoredSrc: string | null = null;
    if (video.status === 'censored' && video.censoredUrl && video.filename) { // Assuming filename is same for censored
        // Assuming censored version uses the same filename for API call, or you have a video.censoredFilename
        const filenameForCensored = video.filename; // Adjust if censored has a different key/filename
        if (!censoredPlayerSrc?.startsWith('blob:')) {
            loadVideoForPreview(video.censoredUrl, filenameForCensored, (src) => {
                setCensoredPlayerSrc(src);
                currentCensoredSrc = src;
            });
        }
    } else {
        setCensoredPlayerSrc(null);
    }
    return () => {
      if (currentCensoredSrc && currentCensoredSrc.startsWith('blob:')) {
         console.log(`[VideoCard] Revoking censored object URL: ${currentCensoredSrc} for ${video.name}`);
        URL.revokeObjectURL(currentCensoredSrc);
      }
    };
  }, [video.censoredUrl, video.filename, video.status, video.id, loadVideoForPreview, censoredPlayerSrc]);


  const handleDownloadOriginal = () => {
    // Explicit download still uses the context function for consistency or if it handles more logic
    downloadVideo(video, 'original');
  };

  const handleDownloadCensored = () => {
    downloadVideo(video, 'censored');
  };

  const getStatusBadge = () => {
    switch (video.status) {
      case 'censored':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white"><CheckCircle2 className="mr-1 h-4 w-4" />Censored</Badge>;
      case 'censoring':
        return <Badge variant="secondary" className="bg-blue-500 text-white animate-pulse"><Clock className="mr-1 h-4 w-4" />Censoring</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertTriangle className="mr-1 h-4 w-4" />Failed</Badge>;
      case 'uploaded': // "uploaded" could mean processing or ready, depending on backend
        return <Badge variant="outline" className="bg-yellow-400 text-black"><Clock className="mr-1 h-4 w-4" />Processing</Badge>;
      case 'uploading':
         return <Badge variant="secondary" className="animate-pulse"><Loader2 className="mr-1 h-4 w-4 animate-spin" />Uploading</Badge>;
      default:
        return <Badge variant="outline">{video.status}</Badge>;
    }
  };
  
  let formattedDate = 'Date unavailable';
  if (video.uploadDate) {
    try {
      const dateObj = parseISO(video.uploadDate);
      if (isValid(dateObj)) {
        formattedDate = formatDistanceToNow(dateObj, { addSuffix: true });
      } else {
        console.warn(`[VideoCard] Invalid date format for uploadDate: ${video.uploadDate} for video ID: ${video.id}`);
      }
    } catch (e) {
        console.warn(`[VideoCard] Error parsing uploadDate: ${video.uploadDate} for video ID: ${video.id}`, e);
    }
  } else {
    // console.warn(`[VideoCard] uploadDate is missing for video ID: ${video.id}`);
  }
  
  const renderVideoPreview = (src: string | null, type: 'original' | 'censored') => {
    if (isLoadingPreview && !src) { // Show loader only if src is not yet set
      return (
        <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      );
    }
    if (previewError && !src) { // Show error if loading failed and no src
         return (
            <div className="flex flex-col items-center justify-center h-48 bg-destructive/10 rounded-md text-destructive p-4">
                <AlertTriangle className="w-12 h-12 mb-2" />
                <p className="font-semibold">Error Loading Preview</p>
                <p className="text-xs text-center">{previewError}</p>
            </div>
        );
    }
    if (src) {
      return <VideoPlayer src={src} />;
    }
    if (type === 'original' && video.status === 'uploading') {
        return (
            <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
                <p className="text-muted-foreground">Video is uploading...</p>
            </div>
        );
    }
    if (type === 'censored' && video.status === 'censoring') {
        return (
            <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
                <p className="text-muted-foreground">Censoring in progress...</p>
            </div>
        );
    }
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
        <Video className="w-12 h-12 text-muted-foreground mb-2" />
        <p className="text-muted-foreground text-center">{type === 'original' ? 'Original' : 'Censored'} video preview not available.</p>
        {(type === 'original' && video.originalUrl && video.filename && !isLoadingPreview && !previewError) && (
             <Button variant="outline" size="sm" onClick={() => loadVideoForPreview(video.originalUrl, video.filename, setOriginalPlayerSrc)} className="mt-2">
                <PlayCircle className="mr-2 h-4 w-4"/> Retry Load
            </Button>
        )}
      </div>
    );
  };


  return (
    <Card className="w-full overflow-hidden shadow-lg transition-all hover:shadow-xl">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl truncate" title={video.name || video.filename || "Unnamed Video"}>
                {video.name || video.filename || "Unnamed Video"}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Uploaded {formattedDate}
              {video.originalWidth && video.originalHeight && ` (${video.originalWidth}x${video.originalHeight})`}
            </CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent>
        {video.status === 'failed' && video.error && (
          <div className="my-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive text-sm">
            <p><strong>Error:</strong> {video.error}</p>
          </div>
        )}
        
        <Tabs defaultValue="original" className="w-full mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="original" disabled={!video.originalUrl && video.status !== 'uploading'}>Original</TabsTrigger>
              <TabsTrigger value="censored" disabled={video.status !== 'censored' || !video.censoredUrl}>
                Censored Version
              </TabsTrigger>
            </TabsList>
            <TabsContent value="original" className="mt-4">
              {renderVideoPreview(originalPlayerSrc, 'original')}
            </TabsContent>
            <TabsContent value="censored" className="mt-4">
              {renderVideoPreview(censoredPlayerSrc, 'censored')}
            </TabsContent>
          </Tabs>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
        {video.status !== 'uploading' && video.filename && ( // Allow download if filename exists and not uploading
          <Button
            variant="outline"
            onClick={handleDownloadOriginal}
          >
            <Download className="mr-2 h-4 w-4" /> Download Original
          </Button>
        )}
        {video.status === 'censored' && video.filename && (
          <Button
            variant="default"
            className="!bg-primary hover:!bg-primary/90 text-primary-foreground"
            onClick={handleDownloadCensored}
          >
            <Download className="mr-2 h-4 w-4" /> Download Censored
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
