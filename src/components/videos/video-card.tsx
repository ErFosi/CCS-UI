
"use client";

import type { VideoAsset } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from './video-player';
import { Download, Clock, AlertTriangle, CheckCircle2, Video, Loader2, PlayCircle, Trash2, Wand2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { useVideoContext } from '@/context/video-context';
import { useAuth } from '@/context/auth-context';
import { getVideoApi } from '@/lib/apiClient';
import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  const { downloadVideo: downloadVideoFromContext, deleteVideo, processVideo } = useVideoContext();
  const { getToken } = useAuth();

  const [originalPlayerSrc, setOriginalPlayerSrc] = useState<string | null>(null);
  const [censoredPlayerSrc, setCensoredPlayerSrc] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Refs to store previous video info to avoid unnecessary re-fetches if blob URL is already loaded
  const prevOriginalVideoInfoRef = useRef<{ videoId: string; filename: string | undefined } | null>(null);
  const prevCensoredVideoInfoRef = useRef<{ videoId: string; filename: string | undefined } | null>(null);


  useEffect(() => {
     console.log(`[VideoCard ${video.id}] Received video data prop:`, JSON.parse(JSON.stringify(video)));
  }, [video]);

  const loadVideoForPreview = useCallback(async (videoApiUrl: string | undefined, videoFilenameForApi: string | undefined, setSrc: (url: string | null) => void, type: 'original' | 'censored') => {
    if (!videoApiUrl || !videoFilenameForApi) {
      console.log(`[VideoCard ${video.id}] ${type}: loadVideoForPreview skipped - no URL or filename. URL: ${videoApiUrl}, Filename: ${videoFilenameForApi}`);
      setSrc(null);
      return;
    }

    // Prevent re-entry if already loading this specific preview
    if (isLoadingPreview && (type === 'original' ? originalPlayerSrc === null : censoredPlayerSrc === null)) {
        // This log is too noisy if a sibling card is loading. Need more specific loading state.
        // For now, we rely on not setting src to null if already a blob.
    }

    console.log(`[VideoCard ${video.id}] ${type}: Attempting to load preview for ${videoFilenameForApi} from ${videoApiUrl}`);
    setIsLoadingPreview(true); // Generic loading state, consider type-specific
    setPreviewError(null);

    const token = await getToken();
    if (!token) {
      setPreviewError("Authentication token not available.");
      setIsLoadingPreview(false);
      return;
    }

    try {
      const blob = await getVideoApi(videoFilenameForApi, token);
      const objectUrl = URL.createObjectURL(blob);
      console.log(`[VideoCard ${video.id}] ${type}: Blob URL created for ${videoFilenameForApi}: ${objectUrl}`);
      setSrc(objectUrl);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to load ${type} video preview`;
      console.error(`[VideoCard ${video.id}] ${type}: Error fetching video blob for ${videoFilenameForApi}:`, err);
      setPreviewError(errorMessage);
      setSrc(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [getToken, isLoadingPreview, originalPlayerSrc, censoredPlayerSrc]); // Removed setSrc from deps

  // Effect for loading original video preview
  useEffect(() => {
    let currentOriginalSrc: string | null = null;
    const filenameForOriginal = video.filename;

    if (video.status !== 'uploading' && video.originalUrl && filenameForOriginal) {
      if (!originalPlayerSrc?.startsWith('blob:') ||
          prevOriginalVideoInfoRef.current?.videoId !== video.id ||
          prevOriginalVideoInfoRef.current?.filename !== filenameForOriginal) {
        prevOriginalVideoInfoRef.current = { videoId: video.id, filename: filenameForOriginal };
        loadVideoForPreview(video.originalUrl, filenameForOriginal, (src) => {
          setOriginalPlayerSrc(src);
          currentOriginalSrc = src;
        }, 'original');
      }
    } else if (video.status === 'uploading' && video.originalUrl?.startsWith('blob:')) {
      setOriginalPlayerSrc(video.originalUrl);
      currentOriginalSrc = video.originalUrl;
    } else {
      if (originalPlayerSrc?.startsWith('blob:')) URL.revokeObjectURL(originalPlayerSrc);
      setOriginalPlayerSrc(null);
      if (prevOriginalVideoInfoRef.current?.videoId === video.id) {
           prevOriginalVideoInfoRef.current = null;
      }
    }
    return () => {
      if (currentOriginalSrc && currentOriginalSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentOriginalSrc);
      }
    };
  }, [video.originalUrl, video.filename, video.status, video.id, loadVideoForPreview, originalPlayerSrc]);

  // Effect for loading censored video preview
  useEffect(() => {
    let currentCensoredSrc: string | null = null;
    const filenameForCensored = video.processedFilename;

    if (video.status === 'censored' && video.censoredUrl && filenameForCensored) {
      if (!censoredPlayerSrc?.startsWith('blob:') ||
          prevCensoredVideoInfoRef.current?.videoId !== video.id ||
          prevCensoredVideoInfoRef.current?.filename !== filenameForCensored) {
        prevCensoredVideoInfoRef.current = { videoId: video.id, filename: filenameForCensored };
        loadVideoForPreview(video.censoredUrl, filenameForCensored, (src) => {
          setCensoredPlayerSrc(src);
          currentCensoredSrc = src;
        }, 'censored');
      }
    } else {
      if (censoredPlayerSrc?.startsWith('blob:')) URL.revokeObjectURL(censoredPlayerSrc);
      setCensoredPlayerSrc(null);
       if (prevCensoredVideoInfoRef.current?.videoId === video.id) {
           prevCensoredVideoInfoRef.current = null;
      }
    }
    return () => {
      if (currentCensoredSrc && currentCensoredSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentCensoredSrc);
      }
    };
  }, [video.censoredUrl, video.processedFilename, video.status, video.id, loadVideoForPreview, censoredPlayerSrc]);


  const handleDownload = (type: 'original' | 'censored') => {
    downloadVideoFromContext(video, type);
  };

  const handleDelete = () => {
    if (!video.filename) {
        console.warn("[VideoCard] Delete called but video.filename is missing", video);
        return;
    }
    deleteVideo(video.id, video.filename, video.processedFilename); // Pass processedFilename if needed for backend
  };

  const handleProcessVideo = () => {
    if (video.status === 'uploaded' && video.filename) {
      processVideo(video);
    } else {
      console.warn("[VideoCard] ProcessVideo called but video not in 'uploaded' state or filename missing", video);
    }
  }


  const getStatusBadge = () => {
    switch (video.status) {
      case 'censored':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white"><CheckCircle2 className="mr-1 h-4 w-4" />Censored</Badge>;
      case 'censoring':
        return <Badge variant="secondary" className="bg-blue-500 text-white animate-pulse"><Loader2 className="mr-1 h-4 w-4 animate-spin" />Censoring</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertTriangle className="mr-1 h-4 w-4" />Failed</Badge>;
      case 'uploaded':
        return <Badge variant="outline" className="bg-yellow-400 text-black"><Clock className="mr-1 h-4 w-4" />Uploaded</Badge>;
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
        console.warn(`[VideoCard ${video.id}] Invalid uploadDate for parsing:`, video.uploadDate);
      }
    } catch (e) {
       console.warn(`[VideoCard ${video.id}] Error parsing uploadDate "${video.uploadDate}":`, e);
    }
  }

  const renderVideoPreview = (src: string | null, type: 'original' | 'censored', videoApiUrl?: string, videoFilenameForApi?: string) => {
    if (isLoadingPreview && !src) { // Only show main loader if src is not yet available
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
                 <Button variant="outline" size="sm" onClick={() => loadVideoForPreview(videoApiUrl, videoFilenameForApi, type === 'original' ? setOriginalPlayerSrc : setCensoredPlayerSrc, type)} className="mt-2">
                    <PlayCircle className="mr-2 h-4 w-4"/> Retry Load
                </Button>
            </div>
        );
    }
    if (src) {
      return <VideoPlayer src={src} />;
    }
    // Conditions for showing placeholder if video is still processing or just uploaded
    if ((type === 'original' && video.status === 'uploading') || (type === 'censored' && (video.status === 'censoring' || video.status === 'uploaded'))) {
        return (
            <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
                <p className="text-muted-foreground">
                    {video.status === 'uploading' ? 'Video is uploading...' : 
                     video.status === 'censoring' ? 'Censoring in progress...' :
                     'Video uploaded, awaiting processing.'}
                </p>
            </div>
        );
    }

    const canRetry = videoApiUrl && videoFilenameForApi;
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
        <Video className="w-12 h-12 text-muted-foreground mb-2" />
        <p className="text-muted-foreground text-center">{type === 'original' ? 'Original' : 'Censored'} video preview not available.</p>
        {canRetry && (
             <Button variant="outline" size="sm" onClick={() => loadVideoForPreview(videoApiUrl, videoFilenameForApi, type === 'original' ? setOriginalPlayerSrc : setCensoredPlayerSrc, type)} className="mt-2">
                <PlayCircle className="mr-2 h-4 w-4"/> Retry Load
            </Button>
        )}
      </div>
    );
  };

  const isCensoredTabDisabled = video.status !== 'censored' || !video.censoredUrl;
  if (video.id) { // Only log if video.id is present to avoid clutter during initial renders
    console.log(`[VideoCard ${video.id}] Censored Tab Render Check: status=${video.status}, censoredUrl=${video.censoredUrl}, isDisabled=${isCensoredTabDisabled}`);
  }


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
              <TabsTrigger value="original" disabled={video.status === 'uploading' && !video.originalUrl?.startsWith('blob:')}>Original</TabsTrigger>
              <TabsTrigger value="censored" disabled={isCensoredTabDisabled}>
                Censored Version
              </TabsTrigger>
            </TabsList>
            <TabsContent value="original" className="mt-4">
              {renderVideoPreview(originalPlayerSrc, 'original', video.originalUrl, video.filename)}
            </TabsContent>
            <TabsContent value="censored" className="mt-4">
              {renderVideoPreview(censoredPlayerSrc, 'censored', video.censoredUrl, video.processedFilename)}
            </TabsContent>
          </Tabs>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
        {video.status === 'uploaded' && (
            <Button
                variant="outline"
                size="sm"
                onClick={handleProcessVideo}
                className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
                disabled={video.status === 'censoring'} // Disable if already going into censoring
            >
                {video.status === 'censoring' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                )}
                {video.status === 'censoring' ? 'Processing...' : 'Process Video'}
            </Button>
        )}
        {video.status !== 'uploading' && video.filename && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload('original')}
            disabled={!video.originalUrl && !originalPlayerSrc} // Disable if no source for download
          >
            <Download className="mr-2 h-4 w-4" /> Original
          </Button>
        )}
        {video.status === 'censored' && video.processedFilename && (
          <Button
            variant="default"
            size="sm"
            className="!bg-primary hover:!bg-primary/90 text-primary-foreground"
            onClick={() => handleDownload('censored')}
            disabled={!video.censoredUrl && !censoredPlayerSrc} // Disable if no source for download
          >
            <Download className="mr-2 h-4 w-4" /> Censored
          </Button>
        )}
         {video.filename && (
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
