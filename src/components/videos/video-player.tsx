
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
    <div className={`relative aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black shadow-md ${className}`}>
      <video
        ref={videoRef}
        src={src} // Use src attribute directly
        controls
        width={width} // Note: for responsive videos, direct width/height might be overridden by CSS.
        height={height} // Consider using CSS for sizing if these are not fixed.
        onLoadedMetadata={onLoadedMetadata}
        className="h-full w-full object-contain" // Ensure video scales within its container
        preload="metadata" // Good practice: loads enough to get metadata like duration/dimensions
      >
        {/* Fallback content if the browser doesn't support the video tag or the format */}
        Your browser does not support the video tag or the provided video format.
      </video>
    </div>
  );
}
