
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
import { VideoRegionSelector } from './video-region-selector'; // Import the new component

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

  const prevOriginalVideoInfoRef = useRef<{ videoId: string; filename: string | undefined } | null>(null);
  const prevCensoredVideoInfoRef = useRef<{ videoId: string; filename: string | undefined } | null>(null);

  // Component unmount cleanup for any existing blob URLs
  useEffect(() => {
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
  }, []); 

  const loadVideoForPreview = useCallback(async (
    videoApiUrl: string | undefined, 
    videoFilenameForApi: string | undefined, 
    setSrc: (url: string | null) => void,
    type: 'original' | 'censored',
    setIsLoadingPreview: (loading: boolean) => void,
    setPreviewError: (error: string | null) => void,
    currentBlobSrc: string | null 
  ) => {
    if (!videoApiUrl || !videoFilenameForApi) {
      if (currentBlobSrc && currentBlobSrc.startsWith('blob:')) URL.revokeObjectURL(currentBlobSrc);
      setSrc(null);
      setIsLoadingPreview(false);
      setPreviewError(null);
      return;
    }
    
    setIsLoadingPreview(true);
    setPreviewError(null);

    if (currentBlobSrc && currentBlobSrc.startsWith('blob:')) {
      URL.revokeObjectURL(currentBlobSrc);
    }
    setSrc(null); 

    const token = await getToken();
    if (!token) {
      setPreviewError("Authentication token not available.");
      setIsLoadingPreview(false);
      return;
    }

    try {
      const blob = await getVideoApi(videoFilenameForApi, token);
      if (blob.size === 0 || (blob.type && !blob.type.startsWith('video/'))) {
        setPreviewError(blob.size === 0 ? `Received empty file.` : `Expected video, received type: ${blob.type}`);
        setSrc(null);
      } else {
        const objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to load ${type} video preview`;
      setPreviewError(errorMessage);
      setSrc(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [getToken]);


  // Effect for loading original video preview
  useEffect(() => {
    let isActive = true;
    const filenameForOriginal = video.filename;
    const apiUrlForOriginal = video.originalUrl;

    if (video.status !== 'uploading' && apiUrlForOriginal && filenameForOriginal) {
      const needsLoad = !originalPlayerSrc ||
                        prevOriginalVideoInfoRef.current?.videoId !== video.id ||
                        prevOriginalVideoInfoRef.current?.filename !== filenameForOriginal;
      if (needsLoad && isActive) {
        prevOriginalVideoInfoRef.current = { videoId: video.id, filename: filenameForOriginal };
        loadVideoForPreview(apiUrlForOriginal, filenameForOriginal, setOriginalPlayerSrc, 'original', setIsLoadingOriginalPreview, setOriginalPreviewError, originalPlayerSrc);
      }
    } else if (video.status === 'uploading' && video.originalUrl?.startsWith('blob:')) {
      if (isActive && originalPlayerSrc !== video.originalUrl) {
         if (originalPlayerSrc && originalPlayerSrc.startsWith('blob:')) URL.revokeObjectURL(originalPlayerSrc);
         setOriginalPlayerSrc(video.originalUrl);
         setOriginalPreviewError(null);
      }
    } else {
      if (isActive && originalPlayerSrc && originalPlayerSrc.startsWith('blob:')) {
        URL.revokeObjectURL(originalPlayerSrc);
        setOriginalPlayerSrc(null);
      }
      if (isActive) setOriginalPreviewError(null);
      prevOriginalVideoInfoRef.current = null;
    }
    return () => { isActive = false; };
  }, [video.id, video.originalUrl, video.filename, video.status, loadVideoForPreview, originalPlayerSrc]);

  // Effect for loading censored video preview
  useEffect(() => {
    let isActive = true;
    const filenameForCensored = video.processedFilename;
    const apiUrlForCensored = video.censoredUrl;

    if (video.status === 'censored' && apiUrlForCensored && filenameForCensored) {
      const needsLoad = !censoredPlayerSrc ||
                        prevCensoredVideoInfoRef.current?.videoId !== video.id ||
                        prevCensoredVideoInfoRef.current?.filename !== filenameForCensored;
      if (needsLoad && isActive) {
        prevCensoredVideoInfoRef.current = { videoId: video.id, filename: filenameForCensored };
        loadVideoForPreview(apiUrlForCensored, filenameForCensored, setCensoredPlayerSrc, 'censored', setIsLoadingCensoredPreview, setCensoredPreviewError, censoredPlayerSrc);
      }
    } else {
      if (isActive && censoredPlayerSrc && censoredPlayerSrc.startsWith('blob:')) {
        URL.revokeObjectURL(censoredPlayerSrc);
        setCensoredPlayerSrc(null);
      }
      if (isActive) setCensoredPreviewError(null);
      prevCensoredVideoInfoRef.current = null;
    }
    return () => { isActive = false; };
  }, [video.id, video.status, video.processedFilename, video.censoredUrl, loadVideoForPreview, censoredPlayerSrc]);


  const handleDownload = (type: 'original' | 'censored') => {
    downloadVideoFromContext(video, type);
  };

  const handleDeleteVideo = () => {
    if (!video.filename) return;
    deleteVideo(video.id, video.filename, video.processedFilename);
  };

  const handleOpenSelectionModal = () => {
    if (video.status === 'uploaded' && video.filename && originalPlayerSrc) {
        setShowSelectionModal(true);
    } else {
        console.warn("[VideoCard] Cannot open selection modal. Video not in 'uploaded' state, or filename/original preview missing.", video);
        // Optionally, show a toast to the user
    }
  };

  const handleConfirmSelectionAndProcess = (coordinates: SelectionCoordinates) => {
    setShowSelectionModal(false);
    if (video.status === 'uploaded' && video.filename) {
      processVideoFromContext(video, coordinates);
    }
  };

  const getStatusBadge = () => {
    switch (video.status) {
      case 'censored':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white"><CheckCircle2 className="mr-1 h-4 w-4" />Censored</Badge>;
      case 'censoring':
        return <Badge variant="secondary" className="bg-blue-500 text-white animate-pulse"><Loader2 className="mr-1 h-4 w-4 animate-spin" />Censoring</Badge>;
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
      }
    } catch (e) { /* ignore */ }
  }
  
  const renderVideoPreview = (
    playerSrc: string | null,
    isLoading: boolean,
    errorMsg: string | null,
    type: 'original' | 'censored',
    apiStreamUrl?: string, 
    filenameForApiCall?: string 
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
            <div className="flex flex-col items-center justify-center h-48 bg-destructive/10 rounded-md text-destructive p-4 text-center">
                <AlertTriangle className="w-12 h-12 mb-2" />
                <p className="font-semibold">Error Loading {type} Preview</p>
                <p className="text-xs">{errorMsg}</p>
                 <Button variant="outline" size="sm" onClick={() => {
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
      return <VideoPlayer key={playerSrc} src={playerSrc} />; 
    }

    const placeholderMessage = 
        (type === 'original' && video.status === 'uploading') ? 'Video is uploading...' :
        (type === 'censored' && (video.status === 'censoring' || video.status === 'uploaded')) ? 
            (video.status === 'censoring' ? 'Censoring in progress...' : 'Video uploaded, awaiting censoring.') :
            `${type.charAt(0).toUpperCase() + type.slice(1)} video preview not available.`;

    const canRetryLoad = apiStreamUrl && filenameForApiCall;
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
        { (type === 'original' && video.status === 'uploading') || (type === 'censored' && video.status === 'censoring') ? 
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" /> :
            <Video className="w-12 h-12 text-muted-foreground mb-2" />
        }
        <p className="text-muted-foreground text-center">{placeholderMessage}</p>
        {canRetryLoad && playerSrc === null && !isLoading && ( // Show retry only if not loading and no src yet
             <Button variant="outline" size="sm" onClick={() => {
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
                  onClick={handleOpenSelectionModal}
                  className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
                  disabled={!originalPlayerSrc} // Disable if original preview isn't loaded yet
              >
                  <Crop className="mr-2 h-4 w-4" />
                  Process Video
              </Button>
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

      {showSelectionModal && originalPlayerSrc && (
        <VideoRegionSelector
          isOpen={showSelectionModal}
          onClose={() => setShowSelectionModal(false)}
          videoSrc={originalPlayerSrc} // Use the loaded blob URL of the original video
          originalVideoWidth={video.originalWidth}
          originalVideoHeight={video.originalHeight}
          onConfirm={handleConfirmSelectionAndProcess}
          videoName={video.name}
        />
      )}
    </>
  );
}
