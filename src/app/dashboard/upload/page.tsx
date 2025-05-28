
"use client";

import { useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { VideoPlayer } from '@/components/videos/video-player';
import type { VideoAsset } from '@/lib/types';
import { useVideoContext } from '@/context/video-context';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, Loader2, AlertTriangle } from 'lucide-react';

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ width: number; height: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { uploadVideo, addVideoPlaceholder, updateVideoStatus } = useVideoContext(); // Use new context functions
  const { toast } = useToast();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setFile(null);
    setPreviewUrl(null);
    setVideoMetadata(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset file input
    }

    if (selectedFile) {
      if (selectedFile.type !== "video/mp4") {
        setError("Invalid file type. Please upload an MP4 video.");
        toast({ title: "Invalid File Type", description: "Please upload an MP4 video.", variant: "destructive" });
        return;
      }

      if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
        setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
        toast({ title: "File Too Large", description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB.`, variant: "destructive" });
        return;
      }

      setFile(selectedFile);
      setIsReadingFile(true);
      setError(null); // Clear previous errors

      try {
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => {
            console.error("FileReader error:", err);
            reject(new Error("Failed to read file."));
          };
          reader.readAsDataURL(selectedFile);
        });
        setPreviewUrl(dataUri);
      } catch (err) {
        console.error("Error reading file for preview:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to read file for preview.";
        setError(errorMessage);
        setPreviewUrl(null);
        setFile(null);
        toast({ title: "File Read Error", description: errorMessage, variant: "destructive" });
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
    if (!file || !previewUrl) {
      setError("Please select a valid MP4 video file and wait for it to load.");
      toast({ title: "No File Selected", description: "Please select an MP4 video.", variant: "destructive" });
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      toast({ title: "File Too Large", description: `Cannot upload. Maximum file size is ${MAX_FILE_SIZE_MB}MB.`, variant: "destructive" });
      return;
    }
    
    // Optionally, check videoMetadata if it's strictly required before upload
    // if (!videoMetadata) {
    //   setError("Video metadata not loaded yet. Please wait or reselect the file.");
    //   return;
    // }

    setIsProcessing(true);
    setError(null);

    const videoId = crypto.randomUUID();
    // Add a placeholder immediately for better UX
    addVideoPlaceholder({
      id: videoId,
      name: file.name,
      uploadDate: new Date().toISOString(),
      status: 'uploading', // New status
      originalDataUri: previewUrl, // Use preview for placeholder
    });

    toast({ title: "Upload Started", description: "Your video is being uploaded. This may take a moment." });

    try {
      const uploadResult = await uploadVideo(file, videoId); // uploadVideo now takes videoId

      if (uploadResult.success && uploadResult.video) {
        // VideoContext's uploadVideo will handle updating the placeholder to the final video details
        toast({ title: "Upload Successful!", description: `${file.name} has been uploaded and is processing.`, variant: "default" });
        router.push('/dashboard/my-videos');
      } else {
        // Error is already handled by uploadVideo in context which calls updateVideoStatus
        setError(uploadResult.error || "Upload failed for an unknown reason.");
        // No need to call updateVideoStatus here if context handles it
      }
    } catch (errCatch) {
      console.error("Upload error in component:", errCatch);
      const errorMessage = errCatch instanceof Error ? errCatch.message : "An unexpected error occurred during upload.";
      updateVideoStatus(videoId, 'failed', undefined, errorMessage); // Update placeholder to failed
      setError(`Upload failed: ${errorMessage}`);
      toast({ title: "Upload Failed", description: errorMessage, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const canSubmit = file && previewUrl && !isReadingFile && !isProcessing;
  const submitButtonText = isProcessing ? "Processing..." : "Upload & Censor Video";

  return (
    <div className="container mx-auto py-2">
      <Card className="w-full max-w-2xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center">Upload Video for Censoring</CardTitle>
          <CardDescription>Select an MP4 video (max {MAX_FILE_SIZE_MB}MB) to identify and censor sensitive content.</CardDescription>
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
            onClick={handleSubmit} // Still using onClick for direct control, form onSubmit also calls it
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
