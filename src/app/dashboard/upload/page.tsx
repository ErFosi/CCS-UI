
"use client";

import { useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { VideoPlayer } from '@/components/videos/video-player';
import { performCensor, readFileAsDataURI } from '@/lib/actions'; // Changed from performUpscale
import type { VideoAsset } from '@/lib/types';
import { useVideoContext } from '@/context/video-context';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, Loader2, AlertTriangle } from 'lucide-react'; // Removed CheckCircle, Info, ImageIcon

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false); 
  const [isProcessing, setIsProcessing] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ width: number; height: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { addVideo, updateVideoStatus } = useVideoContext();
  const { toast } = useToast();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setFile(null); 
    setPreviewUrl(null);
    setVideoMetadata(null);
    setError(null);
    if (fileInputRef.current) { 
        fileInputRef.current.value = "";
    }

    if (selectedFile) {
      if (selectedFile.type !== "video/mp4") {
        setError("Invalid file type. Please upload an MP4 video.");
        return;
      }
      
      setFile(selectedFile);
      setIsReadingFile(true);

      try {
        const dataUri = await readFileAsDataURI(selectedFile);
        setPreviewUrl(dataUri);
      } catch (err) {
        console.error("Error reading file:", err);
        setError("Failed to read file.");
        setPreviewUrl(null);
        setFile(null);
      } finally {
        setIsReadingFile(false);
      }
    }
  };

  const handleVideoLoad = (event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const videoElement = event.currentTarget;
    setVideoMetadata({ width: videoElement.videoWidth, height: videoElement.videoHeight });
    setError(null); 
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !previewUrl || !videoMetadata) { // Ensure videoMetadata is present
      setError("Please select a valid MP4 video file and wait for it to load.");
      return;
    }

    setIsProcessing(true);
    setError(null);
      
    const videoId = crypto.randomUUID();
    const newVideoAsset: VideoAsset = {
      id: videoId,
      name: file.name,
      originalDataUri: previewUrl,
      originalWidth: videoMetadata.width,
      originalHeight: videoMetadata.height,
      uploadDate: new Date().toISOString(),
      status: 'censoring', // Changed from 'upscaling'
    };
    addVideo(newVideoAsset);
    
    toast({ title: "Censoring Started", description: "Your video is being processed. This may take a moment." });

    try {
      const result = await performCensor({ // Changed from performUpscale
        videoId,
        videoDataUri: previewUrl,
        fileName: file.name,
        originalWidth: videoMetadata.width,
        originalHeight: videoMetadata.height,
      });

      if (result.success && result.censoredDataUri) { // Changed from upscaledDataUri
        updateVideoStatus(videoId, 'censored', result.censoredDataUri); // Changed status
        toast({ title: "Censoring Successful!", description: `${file.name} has been censored.`, variant: "default" });
        router.push('/dashboard/my-videos');
      } else {
        throw new Error(result.error || "Censoring failed for an unknown reason.");
      }
    } catch (errCatch) {
      console.error("Censoring error:", errCatch);
      const errorMessage = errCatch instanceof Error ? errCatch.message : "An unexpected error occurred.";
      updateVideoStatus(videoId, 'failed', undefined, errorMessage);
      setError(`Censoring failed: ${errorMessage}`);
      toast({ title: "Censoring Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };
  
  const canSubmit = file && previewUrl && videoMetadata && !isReadingFile && !isProcessing;
  const submitButtonText = isProcessing ? "Processing..." : "Censor Video";

  return (
    <div className="container mx-auto py-2">
      <Card className="w-full max-w-2xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center">Upload Video for Censoring</CardTitle>
          <CardDescription>Select an MP4 video to identify and censor sensitive content.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="video-upload" className="sr-only">Choose video</Label>
              <Input
                id="video-upload"
                type="file"
                accept="video/mp4" // Only MP4
                onChange={handleFileChange}
                ref={fileInputRef}
                className="hidden"
                disabled={isReadingFile || isProcessing}
              />
              <Button 
                type="button" 
                onClick={triggerFileInput} 
                variant="outline"
                className="w-full py-8 border-2 border-dashed hover:border-primary hover:bg-accent/10 transition-all duration-200"
                disabled={isReadingFile || isProcessing}
              >
                {isReadingFile ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <UploadCloud className="mr-2 h-5 w-5" />
                )}
                {file ? `Selected: ${file.name}` : "Click or Drag to Upload MP4 Video"}
              </Button>
            </div>

            {previewUrl && (
              <div className="space-y-2">
                <Label>Video Preview</Label>
                <VideoPlayer src={previewUrl} onLoadedMetadata={handleVideoLoad} />
                {videoMetadata && (
                  <div className="flex items-center text-sm p-2 rounded-md bg-green-100 text-green-700">
                    Video Resolution: {videoMetadata.width}x{videoMetadata.height}px. Ready for censoring.
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
            onClick={handleSubmit}
            className="w-full !bg-primary hover:!bg-primary/90 text-primary-foreground"
            disabled={!canSubmit}
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : null}
            {submitButtonText}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
```