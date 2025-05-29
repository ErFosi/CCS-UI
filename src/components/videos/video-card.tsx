
"use client";

import type { VideoAsset } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from './video-player';
import { Download, Clock, AlertTriangle, CheckCircle2, Video, Loader2, PlayCircle, Trash2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { useVideoContext } from '@/context/video-context';
import { useAuth } from '@/context/auth-context';
import { getVideoApi } from '@/lib/apiClient'; // Assuming this is for direct blob fetching
import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface VideoCardProps {
  video: VideoAsset;
}

export function VideoCard({ video }: VideoCardProps) {
  const { downloadVideo: downloadVideoFromContext, deleteVideo } = useVideoContext();
  const { getToken } = useAuth();

  const [originalPlayerSrc, setOriginalPlayerSrc] = useState<string | null>(null);
  const [censoredPlayerSrc, setCensoredPlayerSrc] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    // console.log("[VideoCard] Received video data:", video);
  }, [video]);

  const loadVideoForPreview = useCallback(async (videoApiUrl: string | undefined, videoFilenameForApi: string, setSrc: (url: string | null) => void) => {
    if (!videoApiUrl || !videoFilenameForApi) { // videoApiUrl is constructed URL, videoFilenameForApi is just the name for the API call
      setSrc(null);
      return;
    }
    
    setIsLoadingPreview(true);
    setPreviewError(null);
    setSrc(null); 

    const token = await getToken();
    if (!token) {
      setPreviewError("Authentication token not available.");
      setIsLoadingPreview(false);
      return;
    }

    try {
      // getVideoApi expects only the filename part, not the full constructed URL
      const blob = await getVideoApi(videoFilenameForApi, token);
      const objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load video preview";
      console.error(`[VideoCard] Error fetching video blob for ${videoFilenameForApi}:`, err);
      setPreviewError(errorMessage);
      setSrc(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [getToken]); 

  useEffect(() => {
    let currentOriginalSrc: string | null = null;
    if (video.status !== 'uploading' && video.originalUrl && video.filename) {
        if (!originalPlayerSrc?.startsWith('blob:')) {
             loadVideoForPreview(video.originalUrl, video.filename, (src) => {
                setOriginalPlayerSrc(src);
                currentOriginalSrc = src;
             });
        }
    } else {
        setOriginalPlayerSrc(null);
    }
    return () => {
      if (currentOriginalSrc && currentOriginalSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentOriginalSrc);
      }
    };
  }, [video.originalUrl, video.filename, video.status, video.id, loadVideoForPreview, originalPlayerSrc]);

  useEffect(() => {
    let currentCensoredSrc: string | null = null;
    if (video.status === 'censored' && video.censoredUrl && video.filename) {
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
        URL.revokeObjectURL(currentCensoredSrc);
      }
    };
  }, [video.censoredUrl, video.filename, video.status, video.id, loadVideoForPreview, censoredPlayerSrc]);

  const handleDownload = (type: 'original' | 'censored') => {
    // Use video.filename for the download, as it's the key part
    downloadVideoFromContext(video, type);
  };
  
  const handleDelete = () => {
    if (!video.filename) {
        // console.error("Cannot delete video: filename is missing.", video);
        // Potentially show a toast error
        return;
    }
    deleteVideo(video.id, video.filename);
  };


  const getStatusBadge = () => {
    switch (video.status) {
      case 'censored':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white"><CheckCircle2 className="mr-1 h-4 w-4" />Censored</Badge>;
      case 'censoring':
        return <Badge variant="secondary" className="bg-blue-500 text-white animate-pulse"><Loader2 className="mr-1 h-4 w-4 animate-spin" />Censoring</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertTriangle className="mr-1 h-4 w-4" />Failed</Badge>;
      case 'uploaded':
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
      }
    } catch (e) { /* Ignore parsing error, fallback is used */ }
  }
  
  const renderVideoPreview = (src: string | null, type: 'original' | 'censored', videoApiUrl?: string, videoFilenameForApi?: string) => {
    if (isLoadingPreview && !src) {
      return (
        <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
          <p className="text-muted-foreground">Loading preview...</p>
        </div>
      );
    }
    if (previewError && !src) {
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
    if ((type === 'original' && video.status === 'uploading') || (type === 'censored' && video.status === 'censoring')) {
        return (
            <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
                <p className="text-muted-foreground">{video.status === 'uploading' ? 'Video is uploading...' : 'Censoring in progress...'}</p>
            </div>
        );
    }
    // Ensure videoApiUrl and videoFilenameForApi are passed for the retry button
    const canRetry = videoApiUrl && videoFilenameForApi;
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
        <Video className="w-12 h-12 text-muted-foreground mb-2" />
        <p className="text-muted-foreground text-center">{type === 'original' ? 'Original' : 'Censored'} video preview not available.</p>
        {canRetry && !isLoadingPreview && (
             <Button variant="outline" size="sm" onClick={() => loadVideoForPreview(videoApiUrl, videoFilenameForApi, type === 'original' ? setOriginalPlayerSrc : setCensoredPlayerSrc)} className="mt-2">
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
              {renderVideoPreview(originalPlayerSrc, 'original', video.originalUrl, video.filename)}
            </TabsContent>
            <TabsContent value="censored" className="mt-4">
              {renderVideoPreview(censoredPlayerSrc, 'censored', video.censoredUrl, video.filename)}
            </TabsContent>
          </Tabs>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
        {video.status !== 'uploading' && video.filename && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload('original')}
          >
            <Download className="mr-2 h-4 w-4" /> Original
          </Button>
        )}
        {video.status === 'censored' && video.filename && (
          <Button
            variant="default"
            size="sm"
            className="!bg-primary hover:!bg-primary/90 text-primary-foreground"
            onClick={() => handleDownload('censored')}
          >
            <Download className="mr-2 h-4 w-4" /> Censored
          </Button>
        )}
         {video.filename && ( // Allow deletion if filename exists
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the video
                  "{video.name || video.filename}" from the server.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                  Yes, delete video
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardFooter>
    </Card>
  );
}
