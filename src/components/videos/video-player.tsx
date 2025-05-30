
"use client";

import React, { useRef, useEffect } from 'react';

interface VideoPlayerProps {
  src: string;
  width?: number;
  height?: number;
  className?: string;
  onLoadedMetadata?: (event: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
}

export function VideoPlayer({ src, width, height, className, onLoadedMetadata }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // This effect ensures that if the src prop changes,
    // the video element is instructed to load the new source.
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [src]);
  
  return (
    // Removed aspect-video, height will be controlled by parent or its own content
    <div className={`relative w-full h-full max-w-full overflow-hidden rounded-lg bg-black shadow-md ${className}`}>
      <video
        ref={videoRef}
        src={src} // Use src attribute directly
        controls
        width={width} 
        height={height}
        onLoadedMetadata={onLoadedMetadata}
        className="h-full w-full object-contain" // object-contain is important to maintain video's aspect ratio within this box
        preload="metadata" 
      >
        Your browser does not support the video tag or the provided video format.
      </video>
    </div>
  );
}

