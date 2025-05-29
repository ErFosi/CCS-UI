
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

  // Effect to clean up blob URLs on component unmount
  useEffect(() => {
    return () => {
      if (originalPlayerSrc && originalPlayerSrc.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] UNMOUNT: Revoking originalPlayerSrc: ${originalPlayerSrc}`);
        URL.revokeObjectURL(originalPlayerSrc);
      }
      if (censoredPlayerSrc && censoredPlayerSrc.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] UNMOUNT: Revoking censoredPlayerSrc: ${censoredPlayerSrc}`);
        URL.revokeObjectURL(censoredPlayerSrc);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only on unmount

  const loadVideoForPreview = useCallback(async (
    videoApiUrl: string | undefined,
    videoFilenameForApi: string | undefined,
    setSrc: (url: string | null) => void,
    type: 'original' | 'censored',
    setIsLoadingPreview: (loading: boolean) => void,
    setPreviewError: (error: string | null) => void
  ) => {
    if (!videoApiUrl || !videoFilenameForApi) {
      console.log(`[VideoCard ${video.id}] ${type}: loadVideoForPreview skipped - no API URL or filename. URL: ${videoApiUrl}, Filename: ${videoFilenameForApi}`);
      setSrc(null);
      setIsLoadingPreview(false);
      return;
    }

    console.log(`[VideoCard ${video.id}] ${type}: Attempting to load preview for ${videoFilenameForApi} using API endpoint ${videoApiUrl}`);
    setIsLoadingPreview(true);
    setPreviewError(null); // Clear previous errors

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
        setIsLoadingPreview(false);
        return;
      }

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
  }, [getToken, video.id]);


  // Effect for loading original video preview
  useEffect(() => {
    const filenameForOriginal = video.filename;
    const apiUrlForOriginal = video.originalUrl;
    let isActive = true;

    console.log(`[VideoCard ${video.id}] Original useEffect: status=${video.status}, originalUrl=${apiUrlForOriginal}, filename=${filenameForOriginal}`);

    if (video.status !== 'uploading' && apiUrlForOriginal && filenameForOriginal) {
      const needsLoad = !originalPlayerSrc ||
                        prevOriginalVideoInfoRef.current?.videoId !== video.id ||
                        prevOriginalVideoInfoRef.current?.filename !== filenameForOriginal;

      if (needsLoad) {
        console.log(`[VideoCard ${video.id}] Original Preview Effect: Triggering load for ${filenameForOriginal}. Current src: ${originalPlayerSrc}`);
        if (originalPlayerSrc && originalPlayerSrc.startsWith('blob:')) {
          console.log(`[VideoCard ${video.id}] Original Preview Effect: Revoking previous originalPlayerSrc: ${originalPlayerSrc}`);
          URL.revokeObjectURL(originalPlayerSrc);
        }
        setOriginalPlayerSrc(null); // Clear previous src before loading new one
        prevOriginalVideoInfoRef.current = { videoId: video.id, filename: filenameForOriginal };
        loadVideoForPreview(apiUrlForOriginal, filenameForOriginal, (src) => { if (isActive) setOriginalPlayerSrc(src); }, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError);
      } else {
        console.log(`[VideoCard ${video.id}] Original Preview Effect: No load needed for ${filenameForOriginal}. Src already set or details unchanged.`);
      }
    } else if (video.status === 'uploading' && video.originalUrl?.startsWith('blob:')) {
      if (isActive) setOriginalPlayerSrc(video.originalUrl);
    } else {
      if (originalPlayerSrc && originalPlayerSrc.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] Original Preview Effect: Revoking originalPlayerSrc due to status/URL change: ${originalPlayerSrc}`);
        URL.revokeObjectURL(originalPlayerSrc);
      }
      if (isActive) setOriginalPlayerSrc(null);
      if (prevOriginalVideoInfoRef.current?.videoId === video.id) {
        prevOriginalVideoInfoRef.current = null;
      }
    }
    return () => {
      isActive = false;
      // Cleanup moved to main unmount effect to avoid premature revocation on prop change
    };
  }, [video.id, video.originalUrl, video.filename, video.status, loadVideoForPreview, originalPlayerSrc]);

  // Effect for loading censored video preview
  useEffect(() => {
    const filenameForCensored = video.processedFilename;
    const apiUrlForCensored = video.censoredUrl;
    let isActive = true;

    console.log(`[VideoCard ${video.id}] Censored useEffect: status=${video.status}, censoredUrl=${apiUrlForCensored}, filename=${filenameForCensored}`);

    if (video.status === 'censored' && apiUrlForCensored && filenameForCensored) {
      const needsLoad = !censoredPlayerSrc ||
                        prevCensoredVideoInfoRef.current?.videoId !== video.id ||
                        prevCensoredVideoInfoRef.current?.filename !== filenameForCensored;

      if (needsLoad) {
        console.log(`[VideoCard ${video.id}] Censored Preview Effect: Triggering load for ${filenameForCensored}. Current src: ${censoredPlayerSrc}`);
        if (censoredPlayerSrc && censoredPlayerSrc.startsWith('blob:')) {
          console.log(`[VideoCard ${video.id}] Censored Preview Effect: Revoking previous censoredPlayerSrc: ${censoredPlayerSrc}`);
          URL.revokeObjectURL(censoredPlayerSrc);
        }
        setCensoredPlayerSrc(null); // Clear previous src before loading new one
        prevCensoredVideoInfoRef.current = { videoId: video.id, filename: filenameForCensored };
        loadVideoForPreview(apiUrlForCensored, filenameForCensored, (src) => { if (isActive) setCensoredPlayerSrc(src); }, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError);
      } else {
        console.log(`[VideoCard ${video.id}] Censored Preview Effect: No load needed for ${filenameForCensored}. Src already set or details unchanged.`);
      }
    } else {
      if (censoredPlayerSrc && censoredPlayerSrc.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] Censored Preview Effect: Revoking censoredPlayerSrc due to status/URL change: ${censoredPlayerSrc}`);
        URL.revokeObjectURL(censoredPlayerSrc);
      }
      if (isActive) setCensoredPlayerSrc(null);
      if (prevCensoredVideoInfoRef.current?.videoId === video.id) {
           prevCensoredVideoInfoRef.current = null;
      }
    }
    return () => {
      isActive = false;
      // Cleanup moved to main unmount effect
    };
  }, [video.id, video.status, video.processedFilename, video.censoredUrl, loadVideoForPreview, censoredPlayerSrc]);

  const handleDownload = (type: 'original' | 'censored') => {
    downloadVideoFromContext(video, type);
  };

  const handleDelete = () => {
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
        // console.warn(`[VideoCard ${video.id}] Invalid uploadDate for parsing:`, video.uploadDate);
      }
    } catch (e) {
       // console.warn(`[VideoCard ${video.id}] Error parsing uploadDate "${video.uploadDate}":`, e);
    }
  }

  const renderVideoPreview = (
    playerSrc: string | null,
    isLoading: boolean,
    errorMsg: string | null,
    type: 'original' | 'censored',
    videoApiStreamUrl?: string,
    videoFilenameForApiCall?: string
  ) => {
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
            <div className="flex flex-col items-center justify-center h-48 bg-destructive/10 rounded-md text-destructive p-4">
                <AlertTriangle className="w-12 h-12 mb-2" />
                <p className="font-semibold">Error Loading {type} Preview</p>
                <p className="text-xs text-center">{errorMsg}</p>
                 <Button variant="outline" size="sm" onClick={() => {
                    console.log(`[VideoCard ${video.id}] ${type}: Retry button clicked.`);
                    if (type === 'original') {
                        loadVideoForPreview(videoApiStreamUrl, videoFilenameForApiCall, setOriginalPlayerSrc, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError);
                    } else {
                        loadVideoForPreview(videoApiStreamUrl, videoFilenameForApiCall, setCensoredPlayerSrc, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError);
                    }
                 }} className="mt-2">
                    <PlayCircle className="mr-2 h-4 w-4"/> Retry Load
                </Button>
            </div>
        );
    }
    if (playerSrc) {
      console.log(`[VideoCard ${video.id}] ${type}: Rendering VideoPlayer with src: ${playerSrc}`);
      return <VideoPlayer src={playerSrc} />;
    }

    if ((type === 'original' && video.status === 'uploading') || (type === 'censored' && (video.status === 'censoring' || video.status === 'uploaded'))) {
        return (
            <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
                <p className="text-muted-foreground">
                    {video.status === 'uploading' ? 'Video is uploading...' :
                     video.status === 'censoring' ? 'Censoring in progress...' :
                     'Video uploaded, awaiting censoring.'}
                </p>
            </div>
        );
    }

    const canRetry = videoApiStreamUrl && videoFilenameForApiCall;
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
        <Video className="w-12 h-12 text-muted-foreground mb-2" />
        <p className="text-muted-foreground text-center">{type} video preview not available.</p>
        {canRetry && (
             <Button variant="outline" size="sm" onClick={() => {
                console.log(`[VideoCard ${video.id}] ${type}: Load Preview button clicked.`);
                 if (type === 'original') {
                    loadVideoForPreview(videoApiStreamUrl, videoFilenameForApiCall, setOriginalPlayerSrc, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError);
                } else {
                    loadVideoForPreview(videoApiStreamUrl, videoFilenameForApiCall, setCensoredPlayerSrc, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError);
                }
             }} className="mt-2">
                <PlayCircle className="mr-2 h-4 w-4"/> Load Preview
            </Button>
        )}
      </div>
    );
  };

  const isCensoredTabDisabled = video.status !== 'censored' || !video.censoredUrl;
  const isOriginalTabDisabled = video.status === 'uploading' && !video.originalUrl?.startsWith('blob:'); 

  // Log the video object received by the card for debugging
  useEffect(() => {
     console.log(`[VideoCard ${video.id}] Received video data prop:`, JSON.parse(JSON.stringify(video)));
  }, [video]);
  
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
                disabled={video.status === 'censoring'}
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
            disabled={(!video.originalUrl && !originalPlayerSrc) || !video.filename}
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
            disabled={(!video.censoredUrl && !censoredPlayerSrc) || !video.processedFilename}
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
        
      