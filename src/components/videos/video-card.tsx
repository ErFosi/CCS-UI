
"use client";

import type { VideoAsset, SelectionCoordinates } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from './video-player';
import { Download, Clock, AlertTriangle, CheckCircle2, Video, Loader2, PlayCircle, Trash2, Wand2, Crop } from 'lucide-react';
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
import { VideoRegionSelector } from './video-region-selector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


interface VideoCardProps {
  video: VideoAsset;
}

export function VideoCard({ video }: VideoCardProps) {
  const { downloadVideo: downloadVideoFromContext, deleteVideo, processVideo: processVideoFromContext } = useVideoContext();
  const { getToken } = useAuth();

  const [originalPlayerSrc, setOriginalPlayerSrc] = useState<string | null>(null);
  const [censoredPlayerSrc, setCensoredPlayerSrc] = useState<string | null>(null);

  const [isLoadingOriginalPreview, setIsLoadingOriginalPreview] = useState<boolean>(false);
  const [isLoadingCensoredPreview, setIsLoadingCensoredPreview] = useState<boolean>(false);
  const [originalPreviewError, setOriginalPreviewError] = useState<string | null>(null);
  const [censoredPreviewError, setCensoredPreviewError] = useState<string | null>(null);

  const [showSelectionModal, setShowSelectionModal] = useState(false);

  // Refs to track the video info for which the current blob URL was loaded
  const prevOriginalVideoInfoRef = useRef<{ videoId: string; filename: string | undefined } | null>(null);
  const prevCensoredVideoInfoRef = useRef<{ videoId: string; filename: string | undefined } | null>(null);

  // Refs to hold the actual blob URLs for cleanup, synced with state
  const originalPlayerSrcBlobRef = useRef<string | null>(null);
  const censoredPlayerSrcBlobRef = useRef<string | null>(null);

  useEffect(() => {
    originalPlayerSrcBlobRef.current = originalPlayerSrc;
  }, [originalPlayerSrc]);

  useEffect(() => {
    censoredPlayerSrcBlobRef.current = censoredPlayerSrc;
  }, [censoredPlayerSrc]);


  const loadVideoForPreview = useCallback(async (
    videoApiUrl: string | undefined, // The API endpoint URL for the video stream
    videoFilenameForApi: string | undefined, // The filename to pass to getVideoApi
    setSrcState: (url: string | null) => void, // State setter for originalPlayerSrc or censoredPlayerSrc
    type: 'original' | 'censored',
    setIsLoadingPreviewState: (loading: boolean) => void,
    setPreviewErrorState: (error: string | null) => void,
    currentBlobRef: React.MutableRefObject<string | null> // Ref to the current blob URL for this type
  ) => {
    console.log(`[VideoCard ${video.id}] ${type}: loadVideoForPreview called. API URL: ${videoApiUrl}, Filename: ${videoFilenameForApi}`);
    if (!videoApiUrl || !videoFilenameForApi) {
      if (currentBlobRef.current && currentBlobRef.current.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] ${type}: Aborting load, no API URL or filename. Revoking existing blob: ${currentBlobRef.current}`);
        URL.revokeObjectURL(currentBlobRef.current);
      }
      currentBlobRef.current = null;
      setSrcState(null);
      setIsLoadingPreviewState(false);
      setPreviewErrorState(null);
      return;
    }

    setIsLoadingPreviewState(true);
    setPreviewErrorState(null);

    // Revoke previous blob URL for this specific type if it exists *before* fetching new one
    if (currentBlobRef.current && currentBlobRef.current.startsWith('blob:')) {
      console.log(`[VideoCard ${video.id}] ${type}: Revoking previous blob URL: ${currentBlobRef.current} before new load.`);
      URL.revokeObjectURL(currentBlobRef.current);
    }
    currentBlobRef.current = null;
    setSrcState(null); // Clear the src state to ensure player re-evaluates

    const token = await getToken();
    if (!token) {
      setPreviewErrorState("Authentication token not available.");
      setIsLoadingPreviewState(false);
      console.log(`[VideoCard ${video.id}] ${type}: Auth token not available.`);
      return;
    }

    try {
      console.log(`[VideoCard ${video.id}] ${type}: Attempting to fetch video blob for ${videoFilenameForApi}`);
      const blob = await getVideoApi(videoFilenameForApi, token);
      console.log(`[VideoCard ${video.id}] ${type}: Blob received. Size: ${blob.size}, Type: ${blob.type}`);

      if (blob.size === 0 || (blob.type && !blob.type.startsWith('video/'))) {
        const errorMsg = blob.size === 0 ? `Received empty file.` : `Expected video, received type: ${blob.type}`;
        console.error(`[VideoCard ${video.id}] ${type}: ${errorMsg}`);
        setPreviewErrorState(errorMsg);
        setSrcState(null);
      } else {
        const objectUrl = URL.createObjectURL(blob);
        console.log(`[VideoCard ${video.id}] ${type}: Blob URL created: ${objectUrl}`);
        currentBlobRef.current = objectUrl; // Store new blob URL in ref
        setSrcState(objectUrl);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to load ${type} video preview`;
      console.error(`[VideoCard ${video.id}] ${type}: Error fetching video blob: ${errorMessage}`, err);
      setPreviewErrorState(errorMessage);
      setSrcState(null);
    } finally {
      setIsLoadingPreviewState(false);
    }
  }, [getToken, video.id]);


  // Effect for original video
  useEffect(() => {
    let isActive = true;
    const currentVideoId = video.id;
    const filenameForOriginal = video.filename;
    const apiUrlForOriginal = video.originalUrl;

    console.log(`[VideoCard ${currentVideoId}] Original useEffect: status=${video.status}, originalUrl=${apiUrlForOriginal}, filenameForOriginal=${filenameForOriginal}, currentSrc=${originalPlayerSrc}`);

    if (filenameForOriginal && apiUrlForOriginal && video.status !== 'uploading') {
      const hasChanged = prevOriginalVideoInfoRef.current?.videoId !== currentVideoId ||
                         prevOriginalVideoInfoRef.current?.filename !== filenameForOriginal;

      if (!originalPlayerSrc || hasChanged) { // Load if no current src OR if underlying video changed
        console.log(`[VideoCard ${currentVideoId}] Original useEffect: Needs load/reload. HasChanged: ${hasChanged}, CurrentSrc: ${originalPlayerSrc}`);
        if (isActive) {
          prevOriginalVideoInfoRef.current = { videoId: currentVideoId, filename: filenameForOriginal };
          loadVideoForPreview(apiUrlForOriginal, filenameForOriginal, setOriginalPlayerSrc, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError, originalPlayerSrcBlobRef);
        }
      }
    } else if (video.status === 'uploading' && video.originalUrl?.startsWith('blob:')) {
      if (isActive && originalPlayerSrc !== video.originalUrl) { // If placeholder blob URL provided directly
        if (originalPlayerSrcBlobRef.current && originalPlayerSrcBlobRef.current.startsWith('blob:')) URL.revokeObjectURL(originalPlayerSrcBlobRef.current);
        setOriginalPlayerSrc(video.originalUrl);
        setOriginalPreviewError(null);
         // Update ref for consistency, though this blob wasn't fetched by loadVideoForPreview
        originalPlayerSrcBlobRef.current = video.originalUrl;
        prevOriginalVideoInfoRef.current = { videoId: currentVideoId, filename: filenameForOriginal };
      }
    } else { // Conditions not met to display original (e.g. missing URL/filename)
      if (isActive && originalPlayerSrcBlobRef.current && originalPlayerSrcBlobRef.current.startsWith('blob:')) {
        console.log(`[VideoCard ${currentVideoId}] Original useEffect: Clearing original preview. Revoking: ${originalPlayerSrcBlobRef.current}`);
        URL.revokeObjectURL(originalPlayerSrcBlobRef.current);
        originalPlayerSrcBlobRef.current = null;
        setOriginalPlayerSrc(null);
      }
       if (isActive) setOriginalPreviewError(null);
       prevOriginalVideoInfoRef.current = null; // Reset since it's not valid anymore
    }
    return () => { isActive = false; };
  }, [video.id, video.originalUrl, video.filename, video.status, loadVideoForPreview]);


  // Effect for censored video
  useEffect(() => {
    let isActive = true;
    const currentVideoId = video.id;
    const filenameForCensored = video.processedFilename;
    const apiUrlForCensored = video.censoredUrl;

    console.log(`[VideoCard ${currentVideoId}] Censored useEffect: status=${video.status}, censoredUrl=${apiUrlForCensored}, filenameForCensored=${filenameForCensored}, currentSrc=${censoredPlayerSrc}`);

    if (video.status === 'censored' && filenameForCensored && apiUrlForCensored) {
      const hasChanged = prevCensoredVideoInfoRef.current?.videoId !== currentVideoId ||
                         prevCensoredVideoInfoRef.current?.filename !== filenameForCensored;

      if (!censoredPlayerSrc || hasChanged) { // Load if no current src OR if underlying video changed
        console.log(`[VideoCard ${currentVideoId}] Censored useEffect: Needs load/reload. HasChanged: ${hasChanged}, CurrentSrc: ${censoredPlayerSrc}`);
        if (isActive) {
          prevCensoredVideoInfoRef.current = { videoId: currentVideoId, filename: filenameForCensored };
          loadVideoForPreview(apiUrlForCensored, filenameForCensored, setCensoredPlayerSrc, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError, censoredPlayerSrcBlobRef);
        }
      }
    } else { // If not in 'censored' state or missing info, ensure censored preview is cleared.
      if (isActive && censoredPlayerSrcBlobRef.current && censoredPlayerSrcBlobRef.current.startsWith('blob:')) {
        console.log(`[VideoCard ${currentVideoId}] Censored useEffect: Clearing censored preview. Revoking: ${censoredPlayerSrcBlobRef.current}`);
        URL.revokeObjectURL(censoredPlayerSrcBlobRef.current);
        censoredPlayerSrcBlobRef.current = null;
        setCensoredPlayerSrc(null);
      }
      if (isActive) setCensoredPreviewError(null);
      prevCensoredVideoInfoRef.current = null; // Reset since it's not valid anymore
    }
    return () => { isActive = false; };
  }, [video.id, video.status, video.processedFilename, video.censoredUrl, loadVideoForPreview]);


  // Final unmount cleanup for the component
  useEffect(() => {
    return () => {
      if (originalPlayerSrcBlobRef.current && originalPlayerSrcBlobRef.current.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] Component UNMOUNT: Revoking originalPlayerSrc: ${originalPlayerSrcBlobRef.current}`);
        URL.revokeObjectURL(originalPlayerSrcBlobRef.current);
      }
      if (censoredPlayerSrcBlobRef.current && censoredPlayerSrcBlobRef.current.startsWith('blob:')) {
        console.log(`[VideoCard ${video.id}] Component UNMOUNT: Revoking censoredPlayerSrc: ${censoredPlayerSrcBlobRef.current}`);
        URL.revokeObjectURL(censoredPlayerSrcBlobRef.current);
      }
    };
  }, [video.id]); // video.id is included to ensure if the card instance is reused for a different video, old blobs are cleaned up. Better would be just [] if instances are truly unique per video.

  const handleDownload = (type: 'original' | 'censored') => {
    downloadVideoFromContext(video, type);
  };

  const handleDeleteVideo = () => {
    if (!video.filename) return; // Should use video.id for context's deleteVideo
    // Assuming video.id is the unique S3 key (user_id/filename.mp4)
    deleteVideo(video.id, video.filename, video.processedFilename);
  };

  const handleOpenSelectionModal = () => {
    if (video.status === 'uploaded' && video.filename && originalPlayerSrc && video.originalWidth && video.originalHeight) {
        setShowSelectionModal(true);
    } else {
        console.warn("[VideoCard] Cannot open selection modal. Video not in 'uploaded' state, or original preview/dimensions missing.", video);
    }
  };

  const handleConfirmSelectionAndProcess = (coordinates: SelectionCoordinates) => {
    setShowSelectionModal(false);
    if (video.status === 'uploaded' && video.filename) { // Use video.id or filename as appropriate for context
      processVideoFromContext(video, coordinates);
    }
  };

  const getStatusBadge = () => {
    switch (video.status) {
      case 'censored':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white"><CheckCircle2 className="mr-1 h-4 w-4" />Processed</Badge>;
      case 'censoring':
        return <Badge variant="secondary" className="bg-blue-500 text-white animate-pulse"><Loader2 className="mr-1 h-4 w-4 animate-spin" />Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertTriangle className="mr-1 h-4 w-4" />Failed {video.error ? `(${video.error.substring(0,30)}...)` : ''}</Badge>;
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
        console.warn(`[VideoCard ${video.id}] Invalid uploadDate: ${video.uploadDate}`);
      }
    } catch (e) {
      console.warn(`[VideoCard ${video.id}] Error parsing uploadDate ${video.uploadDate}:`, e);
    }
  }

  const renderVideoPreview = (
    playerSrc: string | null,
    isLoading: boolean,
    errorMsg: string | null,
    type: 'original' | 'censored',
    apiStreamUrl?: string, // e.g., video.originalUrl or video.censoredUrl
    filenameForApiCall?: string // e.g., video.filename or video.processedFilename
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
                    const blobRef = type === 'original' ? originalPlayerSrcBlobRef : censoredPlayerSrcBlobRef;
                    if (type === 'original') {
                        loadVideoForPreview(apiStreamUrl, filenameForApiCall, setOriginalPlayerSrc, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError, blobRef);
                    } else {
                        loadVideoForPreview(apiStreamUrl, filenameForApiCall, setCensoredPlayerSrc, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError, blobRef);
                    }
                 }} className="mt-2">
                    <PlayCircle className="mr-2 h-4 w-4"/> Retry Load
                </Button>
            </div>
        );
    }
    if (playerSrc) {
      // Key prop ensures VideoPlayer re-mounts if src (blob URL) changes
      return <VideoPlayer key={playerSrc} src={playerSrc} />;
    }

    const placeholderMessage =
        (type === 'original' && video.status === 'uploading') ? 'Video is uploading...' :
        (type === 'censored' && (video.status === 'censoring' || video.status === 'uploaded')) ?
            (video.status === 'censoring' ? 'Processing in progress...' : 'Video uploaded, awaiting processing.') :
            `${type.charAt(0).toUpperCase() + type.slice(1)} video preview not available.`;

    const canRetryLoad = apiStreamUrl && filenameForApiCall;
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
        { (type === 'original' && video.status === 'uploading') || (type === 'censored' && video.status === 'censoring') ?
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" /> :
            <Video className="w-12 h-12 text-muted-foreground mb-2" />
        }
        <p className="text-muted-foreground text-center">{placeholderMessage}</p>
        {canRetryLoad && playerSrc === null && !isLoading && (
             <Button variant="outline" size="sm" onClick={() => {
                 const blobRef = type === 'original' ? originalPlayerSrcBlobRef : censoredPlayerSrcBlobRef;
                 if (type === 'original') {
                    loadVideoForPreview(apiStreamUrl, filenameForApiCall, setOriginalPlayerSrc, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError, blobRef);
                } else {
                    loadVideoForPreview(apiStreamUrl, filenameForApiCall, setCensoredPlayerSrc, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError, blobRef);
                }
             }} className="mt-2">
                <PlayCircle className="mr-2 h-4 w-4"/> Load Preview
            </Button>
        )}
      </div>
    );
  };

  const isCensoredTabDisabled = !(video.status === 'censored' && video.censoredUrl && video.processedFilename);
  const isOriginalTabDisabled = video.status === 'uploading' && !video.originalUrl?.startsWith('blob:');

  console.log(`[VideoCard ${video.id}] RENDER: originalPlayerSrc=${originalPlayerSrc}, censoredPlayerSrc=${censoredPlayerSrc}, isLoadingCensored=${isLoadingCensoredPreview}, censoredError=${censoredPreviewError}`);
  console.log(`[VideoCard ${video.id}] RENDER: video.status=${video.status}, video.censoredUrl=${video.censoredUrl}, video.processedFilename=${video.processedFilename}`);
  console.log(`[VideoCard ${video.id}] RENDER: isCensoredTabDisabled=${isCensoredTabDisabled}`);

  const processButtonDisabled = video.status !== 'uploaded' || !video.originalWidth || !video.originalHeight;
  let processButtonTooltip = "Process this video to enable region selection for censoring.";
  if (video.status !== 'uploaded') {
    processButtonTooltip = "Video must be in 'uploaded' state to process.";
  } else if (!video.originalWidth || !video.originalHeight) {
    processButtonTooltip = "Video dimensions are missing. Cannot process for region selection.";
  }

  return (
    <>
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
                  Processed Version
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
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <div className={processButtonDisabled ? "cursor-not-allowed" : ""}>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenSelectionModal}
                        className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
                        disabled={processButtonDisabled || !originalPlayerSrc}
                        aria-disabled={processButtonDisabled || !originalPlayerSrc}
                    >
                        <Crop className="mr-2 h-4 w-4" />
                        Select Region & Process
                    </Button>
                  </div>
                </TooltipTrigger>
                {processButtonDisabled && (
                  <TooltipContent>
                    <p>{processButtonTooltip}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
          {video.status === 'censoring' && (
             <Button variant="outline" size="sm" disabled className="border-blue-500 text-blue-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
            </Button>
          )}
          {video.filename && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload('original')}
              disabled={!video.originalUrl || !video.filename || video.status === 'uploading'}
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
              disabled={!video.censoredUrl || !video.processedFilename}
            >
              <Download className="mr-2 h-4 w-4" /> Processed
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

      {showSelectionModal && originalPlayerSrc && video.originalWidth && video.originalHeight && (
        <VideoRegionSelector
          isOpen={showSelectionModal}
          onClose={() => setShowSelectionModal(false)}
          videoSrc={originalPlayerSrc}
          originalVideoWidth={video.originalWidth}
          originalVideoHeight={video.originalHeight}
          onConfirm={handleConfirmSelectionAndProcess}
          videoName={video.name}
        />
      )}
    </>
  );
}

    