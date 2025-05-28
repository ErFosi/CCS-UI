
"use client";

import { useState, useRef, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { VideoPlayer } from '@/components/videos/video-player';
import { useVideoContext } from '@/context/video-context';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, Loader2, AlertTriangle, Image as ImageIcon, Video } from 'lucide-react'; // Added ImageIcon, Video

const MAX_FILE_SIZE_MB = 50; // Kept from previous logic
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'video' | 'image' | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // Renamed from isUploading for clarity with API
  const [error, setError] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ width: number; height: number } | null>(null);


  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { uploadVideo } = useVideoContext(); // Using new context function
  const { toast } = useToast();

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    setFile(null);
    setPreviewUrl(null);
    setVideoMetadata(null);
    setError(null);
    setFileType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset file input
    }

    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
        setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
        toast({ title: "File Too Large", description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB.`, variant: "destructive" });
        return;
      }
      
      let currentFileType: 'video' | 'image' | null = null;
      if (selectedFile.type.startsWith("video/")) {
        if (selectedFile.type !== "video/mp4") {
          setError("Invalid video type. Please upload an MP4 video.");
          toast({ title: "Invalid Video Type", description: "Please upload an MP4 video.", variant: "destructive" });
          return;
        }
        currentFileType = 'video';
      } else if (selectedFile.type.startsWith("image/")) {
        // Allow common image types
        const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (!allowedImageTypes.includes(selectedFile.type)) {
          setError("Invalid image type. Please upload JPEG, PNG, GIF or WEBP.");
          toast({ title: "Invalid Image Type", description: "Allowed types: JPEG, PNG, GIF, WEBP.", variant: "destructive" });
          return;
        }
        currentFileType = 'image';
      } else {
        setError("Unsupported file type. Please upload an MP4 video or a common image file.");
        toast({ title: "Unsupported File Type", description: "Upload MP4, JPEG, PNG, GIF, or WEBP.", variant: "destructive" });
        return;
      }
      
      setFileType(currentFileType);
      setFile(selectedFile);
      setIsReadingFile(true);
      setError(null);

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
      } catch (errCatch) {
        console.error("Error reading file for preview:", errCatch);
        const errorMessage = errCatch instanceof Error ? errCatch.message : "Failed to read file for preview.";
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
    setError(null); // Clear errors related to video loading
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !previewUrl) {
      setError("Please select a valid file and wait for it to load.");
      toast({ title: "No File Selected", description: "Please select a file.", variant: "destructive" });
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      toast({ title: "File Too Large", description: `Cannot upload. Maximum file size is ${MAX_FILE_SIZE_MB}MB.`, variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    setError(null);

    if (fileType === 'video') {
        toast({ title: "Video Upload Started", description: "Your video is being uploaded..." });
        try {
            await uploadVideo(file, file.name); // VideoContext handles UI updates
            // On success, VideoContext's toast should show. We can optionally navigate.
            router.push('/dashboard/my-videos');
        } catch (errCatch) { // This catch might be redundant if context handles toast for its errors
            console.error("Upload error in component (video):", errCatch);
            const errorMessage = errCatch instanceof Error ? errCatch.message : "An unexpected error occurred during video upload.";
            setError(`Upload failed: ${errorMessage}`);
            toast({ title: "Video Upload Failed", description: errorMessage, variant: "destructive" });
        } finally {
            setIsProcessing(false);
        }
    } else if (fileType === 'image') {
        // Placeholder for image handling, as per previous logic
        toast({ title: "Image Selected", description: "Image processing features are planned for the future. This image won't be uploaded yet.", duration: 5000 });
        // Reset form for now or navigate
        setFile(null);
        setPreviewUrl(null);
        setFileType(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsProcessing(false);
    } else {
        setError("Unsupported file type for submission.");
        toast({ title: "Unsupported File", description: "Cannot submit this file type.", variant: "destructive" });
        setIsProcessing(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const canSubmit = file && previewUrl && !isReadingFile && !isProcessing;
  let submitButtonText = "Upload Media";
  if (isProcessing) {
    submitButtonText = "Processing...";
  } else if (fileType === 'video') {
    submitButtonText = "Upload & Censor Video";
  } else if (fileType === 'image') {
    submitButtonText = "Confirm Image";
  }


  return (
    <div className="container mx-auto py-2">
      <Card className="w-full max-w-2xl mx-auto shadow-xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center">Upload Multimedia</CardTitle>
          <CardDescription>Select an MP4 video (max {MAX_FILE_SIZE_MB}MB) for censoring, or an image.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="media-upload" className="sr-only">Choose media</Label>
              <Input
                id="media-upload"
                type="file"
                accept="video/mp4,image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileChange}
                ref={fileInputRef}
                className="hidden"
                disabled={isReadingFile || isProcessing}
              />
              <Button
                type="button"
                onClick={triggerFileInput}
                variant="outline"
                className="w-full py-8 border-2 border-dashed hover:border-primary hover:bg-accent/10 transition-all duration-200 flex flex-col items-center justify-center"
                disabled={isReadingFile || isProcessing}
              >
                {isReadingFile ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <UploadCloud className="h-8 w-8 mb-2 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {file ? `Selected: ${file.name}` : "Click or Drag to Upload MP4 or Image"}
                </span>
                <span className="text-xs text-muted-foreground mt-1">Max {MAX_FILE_SIZE_MB}MB</span>
              </Button>
            </div>

            {previewUrl && fileType === 'video' && (
              <div className="space-y-2">
                <Label>Video Preview</Label>
                <VideoPlayer src={previewUrl} onLoadedMetadata={handleVideoLoad} />
                {videoMetadata && (
                  <div className="flex items-center text-sm p-2 rounded-md bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">
                    <Video className="h-4 w-4 mr-2 shrink-0" /> Video Resolution: {videoMetadata.width}x{videoMetadata.height}px. Ready for processing.
                  </div>
                )}
              </div>
            )}
            {previewUrl && fileType === 'image' && (
              <div className="space-y-2">
                <Label>Image Preview</Label>
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                  <img src={previewUrl} alt="Image preview" className="max-h-full max-w-full object-contain" />
                </div>
                 <div className="flex items-center text-sm p-2 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                    <ImageIcon className="h-4 w-4 mr-2 shrink-0" /> Image selected. Processing features coming soon.
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
