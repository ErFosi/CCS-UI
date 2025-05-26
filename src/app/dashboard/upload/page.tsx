
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
import { UploadCloud, Loader2, AlertTriangle, CheckCircle, Info, Image as ImageIcon } from 'lucide-react';

const TARGET_WIDTH = 854; // For 480p video, common width
const TARGET_HEIGHT = 480; // For 480p video, common height

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false); // For file reading
  const [isProcessing, setIsProcessing] = useState(false); // Generic for upscale or image confirm
  const [error, setError] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ width: number; height: number } | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<'video' | 'image' | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { addVideo, updateVideoStatus } = useVideoContext();
  const { toast } = useToast();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setFile(null); // Reset previous file state
    setPreviewUrl(null);
    setSelectedFileType(null);
    setVideoMetadata(null);
    setError(null);
    if (fileInputRef.current) { // Clear the actual file input value
        fileInputRef.current.value = "";
    }

    if (selectedFile) {
      const fileType = selectedFile.type;

      if (fileType === "video/mp4") {
        setSelectedFileType('video');
      } else if (fileType.startsWith("image/")) {
        setSelectedFileType('image');
      } else {
        setError("Invalid file type. Please upload an MP4 video or an image (JPEG, PNG, GIF).");
        return;
      }
      
      setFile(selectedFile);
      setIsUploading(true);

      try {
        const dataUri = await readFileAsDataURI(selectedFile);
        setPreviewUrl(dataUri);
      } catch (err) {
        console.error("Error reading file:", err);
        setError("Failed to read file.");
        setPreviewUrl(null);
        setSelectedFileType(null);
        setFile(null);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleVideoLoad = (event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    if (selectedFileType !== 'video' || !file) return;

    const videoElement = event.currentTarget;
    const currentVideoMetadata = { width: videoElement.videoWidth, height: videoElement.videoHeight };
    setVideoMetadata(currentVideoMetadata);
    
    if (videoElement.videoHeight !== TARGET_HEIGHT) {
         setError(`For AI upscaling, video resolution must be 480p (height ${TARGET_HEIGHT}px). Detected: ${videoElement.videoWidth}x${videoElement.videoHeight}px.`);
    } else {
        setError(null); 
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !previewUrl || !selectedFileType) {
      setError("Please select a valid file.");
      return;
    }

    setIsProcessing(true);

    if (selectedFileType === 'image') {
      toast({ 
        title: "Image Selected", 
        description: `"${file.name}" is ready. Image processing features are coming soon!` 
      });
      // Reset form for images after a short delay for toast visibility
      setTimeout(() => {
        setFile(null);
        setPreviewUrl(null);
        setSelectedFileType(null);
        setVideoMetadata(null);
        setError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsProcessing(false);
      }, 1500);
      return;
    }

    // Video processing logic
    if (selectedFileType === 'video') {
      if (!videoMetadata) {
        setError("Video metadata not loaded. Please wait or reselect the video.");
        setIsProcessing(false);
        return;
      }
      if (videoMetadata.height !== TARGET_HEIGHT) {
        setError(`Video resolution must be 480p (height ${TARGET_HEIGHT}px) for upscaling. Detected: ${videoMetadata.width}x${videoMetadata.height}px. Cannot upscale.`);
        setIsProcessing(false);
        return;
      }

      setError(null);
      
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
      } catch (errCatch) {
        console.error("Upscaling error:", errCatch);
        const errorMessage = errCatch instanceof Error ? errCatch.message : "An unexpected error occurred.";
        updateVideoStatus(videoId, 'failed', undefined, errorMessage);
        setError(`Upscaling failed: ${errorMessage}`);
        toast({ title: "Upscaling Failed", description: errorMessage, variant: "destructive" });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const isVideoResolutionCorrectForUpscaling = selectedFileType === 'video' && videoMetadata?.height === TARGET_HEIGHT;
  
  const canSubmit = file && previewUrl && selectedFileType && !isUploading && !isProcessing &&
                    (selectedFileType === 'image' || (selectedFileType === 'video' && videoMetadata && isVideoResolutionCorrectForUpscaling));

  let submitButtonText = "Select Media File";
  if (isProcessing) {
    submitButtonText = "Processing...";
  } else if (selectedFileType === 'image') {
    submitButtonText = "Confirm Image";
  } else if (selectedFileType === 'video') {
    submitButtonText = "Upscale Video";
  }


  return (
    <div className="container mx-auto py-2">
      <Card className="w-full max-w-2xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center">User Multimedia</CardTitle>
          <CardDescription>Select a 480p MP4 video for AI upscaling, or an image file.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="media-upload" className="sr-only">Choose media</Label>
              <Input
                id="media-upload"
                type="file"
                accept="video/mp4,image/jpeg,image/png,image/gif"
                onChange={handleFileChange}
                ref={fileInputRef}
                className="hidden"
                disabled={isUploading || isProcessing}
              />
              <Button 
                type="button" 
                onClick={triggerFileInput} 
                variant="outline"
                className="w-full py-8 border-2 border-dashed hover:border-primary hover:bg-accent/10 transition-all duration-200"
                disabled={isUploading || isProcessing}
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  selectedFileType === 'image' ? <ImageIcon className="mr-2 h-5 w-5" /> : <UploadCloud className="mr-2 h-5 w-5" />
                )}
                {file ? `Selected: ${file.name}` : "Click or Drag to Upload MP4 or Image"}
              </Button>
            </div>

            {previewUrl && selectedFileType === 'video' && (
              <div className="space-y-2">
                <Label>Video Preview</Label>
                <VideoPlayer src={previewUrl} onLoadedMetadata={handleVideoLoad} />
                {videoMetadata && (
                  <div className={`flex items-center text-sm p-2 rounded-md ${isVideoResolutionCorrectForUpscaling ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {isVideoResolutionCorrectForUpscaling ? <CheckCircle className="h-4 w-4 mr-2" /> : <Info className="h-4 w-4 mr-2" />}
                    Detected Video Resolution: {videoMetadata.width}x{videoMetadata.height}px.
                    {!isVideoResolutionCorrectForUpscaling && ` Required for upscaling: height ${TARGET_HEIGHT}px.`}
                  </div>
                )}
              </div>
            )}

            {previewUrl && selectedFileType === 'image' && file && (
              <div className="space-y-2">
                <Label>Image Preview</Label>
                <div className="flex justify-center items-center p-2 border border-dashed border-border rounded-md bg-card">
                    <img src={previewUrl} alt={`Preview of ${file.name}`} className="max-w-full max-h-96 h-auto rounded-md" />
                </div>
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
