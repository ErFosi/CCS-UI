
"use client";

import type { VideoAsset } from '@/lib/types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VideoPlayer } from './video-player';
import { Download, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'; // Removed PlayCircle
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from 'date-fns';

interface VideoCardProps {
  video: VideoAsset;
}

export function VideoCard({ video }: VideoCardProps) {
  const handleDownload = (dataUri: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = dataUri;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = () => {
    switch (video.status) {
      case 'censored': // Changed from 'completed'
        return <Badge variant="default" className="bg-green-500 text-white"><CheckCircle2 className="mr-1 h-4 w-4" />Censored</Badge>;
      case 'censoring': // Changed from 'upscaling'
        return <Badge variant="secondary" className="bg-blue-500 text-white animate-pulse"><Clock className="mr-1 h-4 w-4" />Censoring</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertTriangle className="mr-1 h-4 w-4" />Failed</Badge>;
      case 'uploaded':
        return <Badge variant="outline">Uploaded</Badge>;
      default:
        return <Badge variant="outline">{video.status}</Badge>;
    }
  };
  
  const formattedDate = formatDistanceToNow(new Date(video.uploadDate), { addSuffix: true });

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
              <TabsTrigger value="original" disabled={!video.originalDataUri}>Original</TabsTrigger>
              <TabsTrigger value="censored" disabled={video.status !== 'censored' || !video.censoredDataUri}>
                Censored Version
              </TabsTrigger>
            </TabsList>
            <TabsContent value="original" className="mt-4">
              {video.originalDataUri ? (
                <VideoPlayer src={video.originalDataUri} />
              ) : (
                <p className="text-muted-foreground text-center py-8">Original video not available.</p>
              )}
            </TabsContent>
            <TabsContent value="censored" className="mt-4">
              {video.status === 'censored' && video.censoredDataUri ? (
                <VideoPlayer src={video.censoredDataUri} />
              ) : video.status === 'censoring' ? (
                 <div className="flex flex-col items-center justify-center h-48 bg-muted rounded-md">
                    <Clock className="w-12 h-12 text-primary animate-spin mb-2" />
                    <p className="text-muted-foreground">Censoring in progress...</p>
                 </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">Censored video not yet available.</p>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
        {video.originalDataUri && (
          <Button
            variant="outline"
            onClick={() => handleDownload(video.originalDataUri, `original_${video.name}`)}
          >
            <Download className="mr-2 h-4 w-4" /> Download Original
          </Button>
        )}
        {video.status === 'censored' && video.censoredDataUri && (
          <Button
            variant="default"
            className="!bg-primary hover:!bg-primary/90 text-primary-foreground"
            onClick={() => handleDownload(video.censoredDataUri, `censored_${video.name}`)}
          >
            <Download className="mr-2 h-4 w-4" /> Download Censored
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
