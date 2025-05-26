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
    if (videoRef.current) {
      videoRef.current.load(); // Ensure video reloads if src changes
    }
  }, [src]);
  
  return (
    <div className={`relative aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black shadow-md ${className}`}>
      <video
        ref={videoRef}
        controls
        width={width}
        height={height}
        onLoadedMetadata={onLoadedMetadata}
        className="h-full w-full object-contain"
        preload="metadata"
      >
        <source src={src} type="video/mp4" /> {/* Assuming mp4, adjust if other types are common */}
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
