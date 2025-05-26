"use client";

import { useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { VideoPlayer } from '@/components/videos/video-player';
import { performUpscale, readFileAsDataURI } from '@/lib/actions';
import type { VideoAsset } from '@/lib/types';
import { useVideoContext } from '@/context/video-context';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, Loader2, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const TARGET_WIDTH = 854; // For 480p, common width, height is 480
const TARGET_HEIGHT = 480;

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ width: number; height: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { addVideo, updateVideoStatus } = useVideoContext();
  const { toast } = useToast();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "video/mp4") {
        setError("Invalid file type. Please upload an MP4 video.");
        setFile(null);
        setPreviewUrl(null);
        setVideoMetadata(null);
        return;
      }
      
      setFile(selectedFile);
      setIsUploading(true);
      setError(null);
      setVideoMetadata(null); // Reset metadata

      try {
        const dataUri = await readFileAsDataURI(selectedFile);
        setPreviewUrl(dataUri);
      } catch (err) {
        console.error("Error reading file:", err);
        setError("Failed to read video file.");
        setPreviewUrl(null);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleVideoLoad = (event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const videoElement = event.currentTarget;
    setVideoMetadata({ width: videoElement.videoWidth, height: videoElement.videoHeight });
    
    // Resolution check
    if (videoElement.videoHeight !== TARGET_HEIGHT) { // Simple height check for 480p
         setError(`Video resolution must be 480p (height ${TARGET_HEIGHT}px). Detected: ${videoElement.videoWidth}x${videoElement.videoHeight}px.`);
    } else {
        setError(null); // Clear previous resolution errors if it's now correct
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !previewUrl || !videoMetadata) {
      setError("Please select a valid video file.");
      return;
    }

    if (videoMetadata.height !== TARGET_HEIGHT) {
         setError(`Video resolution must be 480p (height ${TARGET_HEIGHT}px). Detected: ${videoMetadata.width}x${videoMetadata.height}px. Cannot upscale.`);
        return;
    }

    setError(null);
    setIsUpscaling(true);

    const videoId = crypto.randomUUID();
    const newVideoAsset: VideoAsset = {
      id: videoId,
      name: file.name,
      originalDataUri: previewUrl,
      originalWidth: videoMetadata.width,
      originalHeight: videoMetadata.height,
      uploadDate: new Date().toISOString(),
      status: 'upscaling',
    };
    addVideo(newVideoAsset);
    
    toast({ title: "Upscaling Started", description: "Your video is being upscaled. This may take a moment." });

    try {
      const result = await performUpscale({
        videoId,
        videoDataUri: previewUrl,
        fileName: file.name,
        originalWidth: videoMetadata.width,
        originalHeight: videoMetadata.height,
      });

      if (result.success && result.upscaledDataUri) {
        updateVideoStatus(videoId, 'completed', result.upscaledDataUri);
        toast({ title: "Upscaling Successful!", description: `${file.name} has been upscaled to 1080p.`, variant: "default" });
        router.push('/dashboard/my-videos');
      } else {
        throw new Error(result.error || "Upscaling failed for an unknown reason.");
      }
    } catch (err) {
      console.error("Upscaling error:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred.";
      updateVideoStatus(videoId, 'failed', undefined, errorMessage);
      setError(`Upscaling failed: ${errorMessage}`);
      toast({ title: "Upscaling Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsUpscaling(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const isResolutionCorrect = videoMetadata?.height === TARGET_HEIGHT;

  return (
    <div className="container mx-auto py-2">
      <Card className="w-full max-w-2xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center"><UploadCloud className="mr-3 h-7 w-7 text-primary" /> Upload & Upscale Video</CardTitle>
          <CardDescription>Select a 480p MP4 video to upscale to 1080p using AI.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="video-upload" className="sr-only">Choose video</Label>
              <Input
                id="video-upload"
                type="file"
                accept="video/mp4"
                onChange={handleFileChange}
                ref={fileInputRef}
                className="hidden"
                disabled={isUploading || isUpscaling}
              />
              <Button 
                type="button" 
                onClick={triggerFileInput} 
                variant="outline"
                className="w-full py-8 border-2 border-dashed hover:border-primary hover:bg-accent/10 transition-all duration-200"
                disabled={isUploading || isUpscaling}
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <UploadCloud className="mr-2 h-5 w-5" />
                )}
                {file ? `Selected: ${file.name}` : "Click or Drag to Upload MP4 (480p)"}
              </Button>
            </div>

            {previewUrl && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <VideoPlayer src={previewUrl} onLoadedMetadata={handleVideoLoad} />
                {videoMetadata && (
                  <div className={`flex items-center text-sm p-2 rounded-md ${isResolutionCorrect ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {isResolutionCorrect ? <CheckCircle className="h-4 w-4 mr-2" /> : <Info className="h-4 w-4 mr-2" />}
                    Detected Resolution: {videoMetadata.width}x{videoMetadata.height}px.
                    {!isResolutionCorrect && ` Required: height ${TARGET_HEIGHT}px.`}
                  </div>
                )}
              </div>
            )}
            
            {error && (
              <div className="flex items-center text-sm text-destructive p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <AlertTriangle className="h-4 w-4 mr-2 shrink-0" /> {error}
              </div>
            )}
          </form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            onClick={handleSubmit} // Use onClick for form submission trigger when button is outside form or type isn't submit
            className="w-full !bg-primary hover:!bg-primary/90 text-primary-foreground"
            disabled={!file || !previewUrl || isUploading || isUpscaling || !videoMetadata || !isResolutionCorrect}
          >
            {isUpscaling ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : null}
            {isUpscaling ? 'Upscaling...' : 'Upscale Video'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

