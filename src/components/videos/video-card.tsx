
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
  const [isLoadingOriginalPreview, setIsLoadingOriginalPreview] = useState<boolean>(false);
  const [isLoadingCensoredPreview, setIsLoadingCensoredPreview] = useState<boolean>(false);
  const [originalPreviewError, setOriginalPreviewError] = useState<string | null>(null);
  const [censoredPreviewError, setCensoredPreviewError] = useState<string | null>(null);

  const prevOriginalVideoInfoRef = useRef<{ videoId: string; filename: string | undefined } | null>(null);
  const prevCensoredVideoInfoRef = useRef<{ videoId: string; filename: string | undefined } | null>(null);

  // Component unmount cleanup for any existing blob URLs
  useEffect(() => {
    // Store current blob URLs for cleanup on unmount
    const currentOriginalSrc = originalPlayerSrc;
    const currentCensoredSrc = censoredPlayerSrc;
    return () => {
      if (currentOriginalSrc && currentOriginalSrc.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] UNMOUNT: Revoking originalPlayerSrc: ${currentOriginalSrc}`);
        URL.revokeObjectURL(currentOriginalSrc);
      }
      if (currentCensoredSrc && currentCensoredSrc.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] UNMOUNT: Revoking censoredPlayerSrc: ${currentCensoredSrc}`);
        URL.revokeObjectURL(currentCensoredSrc);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only on unmount

  const loadVideoForPreview = useCallback(async (
    videoApiUrl: string | undefined, // e.g., https://localhost:443/videos/filename.mp4
    videoFilenameForApi: string | undefined, // e.g., filename.mp4 or processed_filename.mp4
    setSrc: (url: string | null) => void,
    type: 'original' | 'censored',
    setIsLoadingPreview: (loading: boolean) => void,
    setPreviewError: (error: string | null) => void,
    currentBlobSrc: string | null // Pass current blob src to revoke it before fetching new one
  ) => {
    if (!videoApiUrl || !videoFilenameForApi) {
      console.log(`[VideoCard ${video.id}] ${type}: loadVideoForPreview skipped - no API URL or filename. URL: ${videoApiUrl}, Filename: ${videoFilenameForApi}`);
      if (currentBlobSrc && currentBlobSrc.startsWith('blob:')) URL.revokeObjectURL(currentBlobSrc);
      setSrc(null);
      setIsLoadingPreview(false);
      setPreviewError(null);
      return;
    }

    console.log(`[VideoCard ${video.id}] ${type}: Attempting to load preview for ${videoFilenameForApi} using API endpoint ${videoApiUrl}`);
    setIsLoadingPreview(true);
    setPreviewError(null);

    // Revoke previous blob URL if it exists
    if (currentBlobSrc && currentBlobSrc.startsWith('blob:')) {
      console.log(`[VideoCard ${video.id}] ${type}: Revoking previous blob URL: ${currentBlobSrc}`);
      URL.revokeObjectURL(currentBlobSrc);
    }
    setSrc(null); // Clear src before fetching new one

    const token = await getToken();
    if (!token) {
      console.error(`[VideoCard ${video.id}] ${type}: Authentication token not available.`);
      setPreviewError("Authentication token not available.");
      setIsLoadingPreview(false);
      return;
    }

    try {
      console.log(`[VideoCard ${video.id}] ${type}: Calling getVideoApi with filename: ${videoFilenameForApi}`);
      const blob = await getVideoApi(videoFilenameForApi, token);
      console.log(`[VideoCard ${video.id}] ${type}: Blob received for ${videoFilenameForApi}. Size: ${blob.size}, Type: ${blob.type}`);

      if (blob.size === 0) {
        console.warn(`[VideoCard ${video.id}] ${type}: Received empty blob for ${videoFilenameForApi}.`);
        setPreviewError(`Received empty file for ${type} video.`);
        setSrc(null);
      } else if (blob.type && !blob.type.startsWith('video/')) {
        console.warn(`[VideoCard ${video.id}] ${type}: Received non-video blob type: ${blob.type}`);
        setPreviewError(`Expected a video file, but received type: ${blob.type}`);
        setSrc(null);
      } else {
        const objectUrl = URL.createObjectURL(blob);
        console.log(`[VideoCard ${video.id}] ${type}: Blob URL created for ${videoFilenameForApi}: ${objectUrl}`);
        setSrc(objectUrl);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to load ${type} video preview`;
      console.error(`[VideoCard ${video.id}] ${type}: Error fetching video blob for ${videoFilenameForApi}:`, err);
      setPreviewError(errorMessage);
      setSrc(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [getToken, video.id]);


  // Effect for loading original video preview
  useEffect(() => {
    const filenameForOriginal = video.filename;
    const apiUrlForOriginal = video.originalUrl; // This should be the API endpoint like /videos/filename.mp4
    let isActive = true;

    console.log(`[VideoCard ${video.id}] Original useEffect: status=${video.status}, originalUrl=${apiUrlForOriginal}, filename=${filenameForOriginal}, originalPlayerSrc=${originalPlayerSrc}`);

    if (video.status !== 'uploading' && apiUrlForOriginal && filenameForOriginal) {
      const needsLoad = !originalPlayerSrc ||
                        prevOriginalVideoInfoRef.current?.videoId !== video.id ||
                        prevOriginalVideoInfoRef.current?.filename !== filenameForOriginal;

      if (needsLoad) {
        console.log(`[VideoCard ${video.id}] Original Preview Effect: Triggering load for ${filenameForOriginal}.`);
        prevOriginalVideoInfoRef.current = { videoId: video.id, filename: filenameForOriginal };
        if (isActive) {
           loadVideoForPreview(apiUrlForOriginal, filenameForOriginal, setOriginalPlayerSrc, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError, originalPlayerSrc);
        }
      } else {
        console.log(`[VideoCard ${video.id}] Original Preview Effect: No load needed for ${filenameForOriginal}.`);
      }
    } else if (video.status === 'uploading' && video.originalUrl?.startsWith('blob:')) {
      // This handles the temporary blob URL during upload
      if (isActive && originalPlayerSrc !== video.originalUrl) {
         if (originalPlayerSrc && originalPlayerSrc.startsWith('blob:')) URL.revokeObjectURL(originalPlayerSrc);
         setOriginalPlayerSrc(video.originalUrl);
         setOriginalPreviewError(null);
      }
    } else {
      // Cleanup if no longer valid to show original preview
      if (isActive && originalPlayerSrc && originalPlayerSrc.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] Original Preview Effect: Revoking originalPlayerSrc due to status/URL change: ${originalPlayerSrc}`);
        URL.revokeObjectURL(originalPlayerSrc);
        setOriginalPlayerSrc(null);
      }
      if (isActive) setOriginalPreviewError(null); // Clear error if no longer trying to load
      prevOriginalVideoInfoRef.current = null;
    }
    return () => { isActive = false; };
  }, [video.id, video.originalUrl, video.filename, video.status, loadVideoForPreview, originalPlayerSrc]);

  // Effect for loading censored video preview
  useEffect(() => {
    const filenameForCensored = video.processedFilename;
    const apiUrlForCensored = video.censoredUrl; // This should be the API endpoint like /videos/processed_filename.mp4
    let isActive = true;

    console.log(`[VideoCard ${video.id}] Censored useEffect: status=${video.status}, censoredUrl=${apiUrlForCensored}, processedFilename=${filenameForCensored}, censoredPlayerSrc=${censoredPlayerSrc}`);

    if (video.status === 'censored' && apiUrlForCensored && filenameForCensored) {
      const needsLoad = !censoredPlayerSrc ||
                        prevCensoredVideoInfoRef.current?.videoId !== video.id ||
                        prevCensoredVideoInfoRef.current?.filename !== filenameForCensored;
      
      if (needsLoad) {
        console.log(`[VideoCard ${video.id}] Censored Preview Effect: Triggering load for ${filenameForCensored}.`);
        prevCensoredVideoInfoRef.current = { videoId: video.id, filename: filenameForCensored };
        if (isActive) {
          loadVideoForPreview(apiUrlForCensored, filenameForCensored, setCensoredPlayerSrc, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError, censoredPlayerSrc);
        }
      } else {
         console.log(`[VideoCard ${video.id}] Censored Preview Effect: No load needed for ${filenameForCensored}.`);
      }
    } else {
      // Cleanup if no longer valid to show censored preview
      if (isActive && censoredPlayerSrc && censoredPlayerSrc.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] Censored Preview Effect: Revoking censoredPlayerSrc due to status/URL change: ${censoredPlayerSrc}`);
        URL.revokeObjectURL(censoredPlayerSrc);
        setCensoredPlayerSrc(null);
      }
      if (isActive) setCensoredPreviewError(null); // Clear error if no longer trying to load
      prevCensoredVideoInfoRef.current = null;
    }
    return () => { isActive = false; };
  }, [video.id, video.status, video.processedFilename, video.censoredUrl, loadVideoForPreview, censoredPlayerSrc]);


  const handleDownload = (type: 'original' | 'censored') => {
    // Prioritize direct URL if available and it's not a blob, otherwise use context download
    const directUrl = type === 'original' ? video.originalUrl : video.censoredUrl;
    const filename = type === 'original' ? video.name : (video.processedFilename || `censored_${video.name}`);

    if (directUrl && !directUrl.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = directUrl;
        // To make it download with the Authorization header, we'd need to fetch it as a blob first
        // For simplicity, if it's a direct URL, we assume it might be public or pre-signed.
        // If auth is needed, we should use downloadVideoFromContext.
        // For now, let's assume it's public or context will handle it.
        // a.download = filename;
        // document.body.appendChild(a);
        // a.click();
        // document.body.removeChild(a);
        // console.warn(`[VideoCard ${video.id}] Downloading directly from URL: ${directUrl}. If this URL requires auth and isn't pre-signed, the download might fail or lack auth.`);
        // Fallback to context download which handles auth
         downloadVideoFromContext(video, type);
    } else {
        downloadVideoFromContext(video, type);
    }
  };

  const handleDeleteVideo = () => {
    if (!video.filename) {
        console.warn("[VideoCard] Delete called but video.filename is missing", video);
        return;
    }
    deleteVideo(video.id, video.filename, video.processedFilename);
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

  const renderVideoPreview = (
    playerSrc: string | null,
    isLoading: boolean,
    errorMsg: string | null,
    type: 'original' | 'censored',
    apiStreamUrl?: string, // The direct URL for streaming/download, e.g., https://.../videos/filename.mp4
    filenameForApiCall?: string // The filename part used for the API call in loadVideoForPreview
  ) => {
    console.log(`[VideoCard ${video.id}] ${type}: Rendering VideoPlayer with src: ${playerSrc}, isLoading: ${isLoading}, errorMsg: ${errorMsg}`);
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
          <p className="text-muted-foreground">Loading {type} preview...</p>
        </div>
      );
    }
    if (errorMsg) {
         return (
            <div className="flex flex-col items-center justify-center h-48 bg-destructive/10 rounded-md text-destructive p-4 text-center">
                <AlertTriangle className="w-12 h-12 mb-2" />
                <p className="font-semibold">Error Loading {type} Preview</p>
                <p className="text-xs">{errorMsg}</p>
                 <Button variant="outline" size="sm" onClick={() => {
                    console.log(`[VideoCard ${video.id}] ${type}: Retry button clicked.`);
                    if (type === 'original') {
                        loadVideoForPreview(apiStreamUrl, filenameForApiCall, setOriginalPlayerSrc, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError, originalPlayerSrc);
                    } else {
                        loadVideoForPreview(apiStreamUrl, filenameForApiCall, setCensoredPlayerSrc, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError, censoredPlayerSrc);
                    }
                 }} className="mt-2">
                    <PlayCircle className="mr-2 h-4 w-4"/> Retry Load
                </Button>
            </div>
        );
    }
    if (playerSrc) {
      return <VideoPlayer key={playerSrc} src={playerSrc} />; // Added key={playerSrc}
    }

    if ((type === 'original' && video.status === 'uploading') || (type === 'censored' && (video.status === 'censoring' || video.status === 'uploaded'))) {
        return (
            <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
                <p className="text-muted-foreground text-center">
                    {video.status === 'uploading' ? 'Video is uploading...' :
                     video.status === 'censoring' ? 'Censoring in progress...' :
                     'Video uploaded, awaiting censoring.'}
                </p>
            </div>
        );
    }

    const canRetry = apiStreamUrl && filenameForApiCall;
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
        <Video className="w-12 h-12 text-muted-foreground mb-2" />
        <p className="text-muted-foreground text-center">{type} video preview not available.</p>
        {canRetry && (
             <Button variant="outline" size="sm" onClick={() => {
                console.log(`[VideoCard ${video.id}] ${type}: Load Preview button clicked.`);
                 if (type === 'original') {
                    loadVideoForPreview(apiStreamUrl, filenameForApiCall, setOriginalPlayerSrc, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError, originalPlayerSrc);
                } else {
                    loadVideoForPreview(apiStreamUrl, filenameForApiCall, setCensoredPlayerSrc, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError, censoredPlayerSrc);
                }
             }} className="mt-2">
                <PlayCircle className="mr-2 h-4 w-4"/> Load Preview
            </Button>
        )}
      </div>
    );
  };

  const isCensoredTabDisabled = video.status !== 'censored' || !video.censoredUrl || !video.processedFilename;
  const isOriginalTabDisabled = video.status === 'uploading' && !video.originalUrl?.startsWith('blob:');

  // Logging current state at render time for easier debugging
  console.log(`[VideoCard ${video.id}] RENDER: originalPlayerSrc=${originalPlayerSrc}, censoredPlayerSrc=${censoredPlayerSrc}, isLoadingCensored=${isLoadingCensoredPreview}, censoredError=${censoredPreviewError}`);
  console.log(`[VideoCard ${video.id}] RENDER: video.status=${video.status}, video.censoredUrl=${video.censoredUrl}, video.processedFilename=${video.processedFilename}`);
  console.log(`[VideoCard ${video.id}] RENDER: isCensoredTabDisabled=${isCensoredTabDisabled}`);

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
              <TabsTrigger value="original" disabled={isOriginalTabDisabled}>Original</TabsTrigger>
              <TabsTrigger value="censored" disabled={isCensoredTabDisabled}>
                Censored Version
              </TabsTrigger>
            </TabsList>
            <TabsContent value="original" className="mt-4">
              {renderVideoPreview(originalPlayerSrc, isLoadingOriginalPreview, originalPreviewError, 'original', video.originalUrl, video.filename)}
            </TabsContent>
            <TabsContent value="censored" className="mt-4">
              {renderVideoPreview(censoredPlayerSrc, isLoadingCensoredPreview, censoredPreviewError, 'censored', video.censoredUrl, video.processedFilename)}
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
                disabled={video.status === 'censoring'} // Re-check this condition, maybe just 'censoring' is enough
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
            disabled={!video.originalUrl || !video.filename} // Disable if no original URL or filename
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
            disabled={!video.censoredUrl || !video.processedFilename} // Disable if no censored URL or processed filename
          >
            <Download className="mr-2 h-4 w-4" /> Censored
          </Button>
        )}
         {video.filename && ( // Allow deletion regardless of status, as long as there's a filename to reference
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
                  "{video.name || video.filename}" and its processed version (if any) from the server.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteVideo} className="bg-destructive hover:bg-destructive/90">
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
        
      

    