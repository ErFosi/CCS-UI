
"use client";

import type { VideoAsset } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from './video-player';
import { Download, Clock, AlertTriangle, CheckCircle2, Video } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from 'date-fns';
import { useVideoContext } from '@/context/video-context'; // Import context

interface VideoCardProps {
  video: VideoAsset;
}

export function VideoCard({ video }: VideoCardProps) {
  const { downloadVideo } = useVideoContext(); // Get download function

  const handleDownloadOriginal = () => {
    if (video.originalUrl || video.originalDataUri) { // Prefer URL if available
      if (video.originalUrl) {
        // If it's a direct URL, create a link
        const link = document.createElement('a');
        link.href = video.originalUrl;
        link.download = `original_${video.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (video.originalDataUri) { // Fallback to data URI if URL not present
         const link = document.createElement('a');
         link.href = video.originalDataUri;
         link.download = `original_${video.name}`;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
      }
    } else if (video.filename || video.name) {
       // If only filename is available, use context download (API call)
       downloadVideo(video);
    }
  };

  const handleDownloadCensored = () => {
     if (video.censoredUrl || video.censoredDataUri) {
      if (video.censoredUrl) {
        const link = document.createElement('a');
        link.href = video.censoredUrl;
        link.download = `censored_${video.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (video.censoredDataUri) {
         const link = document.createElement('a');
         link.href = video.censoredDataUri;
         link.download = `censored_${video.name}`;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
      }
    } else {
      // Potentially try to download censored via API if a filename for it exists
      // For now, assume if no URL/DataURI, censored is not directly downloadable this way
      // This would need modification if API provides a separate filename for censored version
      console.warn("Censored video URL or DataURI not available for direct download.");
    }
  };


  const getStatusBadge = () => {
    switch (video.status) {
      case 'censored':
        return <Badge variant="default" className="bg-green-500 text-white"><CheckCircle2 className="mr-1 h-4 w-4" />Censored</Badge>;
      case 'censoring':
        return <Badge variant="secondary" className="bg-blue-500 text-white animate-pulse"><Clock className="mr-1 h-4 w-4" />Censoring</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertTriangle className="mr-1 h-4 w-4" />Failed</Badge>;
      case 'uploaded': // Assuming 'uploaded' means it's on the server, possibly pending censoring
        return <Badge variant="outline" className="bg-yellow-400 text-black"><Clock className="mr-1 h-4 w-4" />Processing</Badge>;
      case 'uploading':
         return <Badge variant="secondary" className="animate-pulse"><Loader2 className="mr-1 h-4 w-4 animate-spin" />Uploading</Badge>;
      default:
        return <Badge variant="outline">{video.status}</Badge>;
    }
  };
  
  const formattedDate = video.uploadDate ? formatDistanceToNow(new Date(video.uploadDate), { addSuffix: true }) : 'N/A';
  const videoSrcForPlayer = video.originalUrl || video.originalDataUri;
  const censoredVideoSrcForPlayer = video.censoredUrl || video.censoredDataUri;

  return (
    <Card className="w-full overflow-hidden shadow-lg transition-all hover:shadow-xl">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">{video.name}</CardTitle>
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
        
        {video.status !== 'failed' && (
          <Tabs defaultValue="original" className="w-full mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="original" disabled={!videoSrcForPlayer}>Original</TabsTrigger>
              <TabsTrigger value="censored" disabled={video.status !== 'censored' || !censoredVideoSrcForPlayer}>
                Censored Version
              </TabsTrigger>
            </TabsList>
            <TabsContent value="original" className="mt-4">
              {videoSrcForPlayer ? (
                <VideoPlayer src={videoSrcForPlayer} />
              ) : video.status === 'uploading' ? (
                <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                  <Loader2 className="w-12 h-12 text-primary animate-spin mb-2" />
                  <p className="text-muted-foreground">Video is uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                  <Video className="w-12 h-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-center">Original video not available for preview.</p>
                 </div>
              )}
            </TabsContent>
            <TabsContent value="censored" className="mt-4">
              {video.status === 'censored' && censoredVideoSrcForPlayer ? (
                <VideoPlayer src={censoredVideoSrcForPlayer} />
              ) : video.status === 'censoring' ? (
                 <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                    <Clock className="w-12 h-12 text-primary animate-spin mb-2" />
                    <p className="text-muted-foreground">Censoring in progress...</p>
                 </div>
              ) : (
                 <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                  <Video className="w-12 h-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-center">Censored video not yet available.</p>
                 </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
        {(video.originalUrl || video.originalDataUri || video.filename || video.name) && video.status !== 'uploading' && (
          <Button
            variant="outline"
            onClick={handleDownloadOriginal}
            disabled={video.status === 'uploading'}
          >
            <Download className="mr-2 h-4 w-4" /> Download Original
          </Button>
        )}
        {video.status === 'censored' && (video.censoredUrl || video.censoredDataUri) && (
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
