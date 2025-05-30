
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SelectionCoordinates } from '@/lib/types';
import { VideoPlayer } from './video-player'; // Assuming this can play the src
import { Crop } from 'lucide-react';

interface VideoRegionSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  videoSrc?: string; // Blob URL or direct URL of the original video for preview
  originalVideoWidth?: number;
  originalVideoHeight?: number;
  onConfirm: (coordinates: SelectionCoordinates) => void;
  videoName?: string;
}

export function VideoRegionSelector({
  isOpen,
  onClose,
  videoSrc,
  originalVideoWidth,
  originalVideoHeight,
  onConfirm,
  videoName
}: VideoRegionSelectorProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [endPoint, setEndPoint] = useState<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<SelectionCoordinates | null>(null);
  
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null); // Ref for the actual video element inside VideoPlayer

  // This effect is to get a ref to the actual video element if VideoPlayer forwards it
  // If VideoPlayer doesn't forward a ref, this approach needs adjustment.
  // For now, we assume VideoPlayer's inner video tag might be accessible.
  // If not, we'll rely on originalVideoWidth/Height for scaling.

  const getRelativeCoords = (clientX: number, clientY: number) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return;
    const { x, y } = getRelativeCoords(event.clientX, event.clientY);
    setIsDrawing(true);
    setStartPoint({ x, y });
    setEndPoint({ x, y }); // Reset endpoint
    setSelection(null);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint || !overlayRef.current) return;
    const { x, y } = getRelativeCoords(event.clientX, event.clientY);
    setEndPoint({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPoint || !endPoint || !overlayRef.current || !originalVideoWidth || !originalVideoHeight) {
      setIsDrawing(false);
      return;
    }

    const overlayRect = overlayRef.current.getBoundingClientRect();
    const displayedVideoWidth = overlayRect.width;
    const displayedVideoHeight = overlayRect.height;

    // Ensure points are within bounds of the displayed video
    const boundedStartX = Math.max(0, Math.min(startPoint.x, displayedVideoWidth));
    const boundedStartY = Math.max(0, Math.min(startPoint.y, displayedVideoHeight));
    const boundedEndX = Math.max(0, Math.min(endPoint.x, displayedVideoWidth));
    const boundedEndY = Math.max(0, Math.min(endPoint.y, displayedVideoHeight));
    
    const x1_display = Math.min(boundedStartX, boundedEndX);
    const y1_display = Math.min(boundedStartY, boundedEndY);
    const x2_display = Math.max(boundedStartX, boundedEndX);
    const y2_display = Math.max(boundedStartY, boundedEndY);

    // Scale coordinates to original video dimensions
    const scaleX = originalVideoWidth / displayedVideoWidth;
    const scaleY = originalVideoHeight / displayedVideoHeight;

    const finalCoords: SelectionCoordinates = {
      x1: Math.round(x1_display * scaleX),
      y1: Math.round(y1_display * scaleY),
      x2: Math.round(x2_display * scaleX),
      y2: Math.round(y2_display * scaleY),
    };
    
    // Ensure x1 < x2 and y1 < y2 after scaling and rounding
    if (finalCoords.x1 >= finalCoords.x2 || finalCoords.y1 >= finalCoords.y2) {
        console.warn("Selection resulted in zero or negative width/height after scaling. Resetting.");
        setSelection(null);
        setStartPoint(null);
        setEndPoint(null);
    } else {
        setSelection(finalCoords);
        console.log("Selection made (display coords):", { x1_display, y1_display, x2_display, y2_display });
        console.log("Scaled to original (final coords):", finalCoords);
    }
    setIsDrawing(false);
  };
  
  useEffect(() => {
    // Reset state when dialog is closed/opened
    if (isOpen) {
      setIsDrawing(false);
      setStartPoint(null);
      setEndPoint(null);
      setSelection(null);
    }
  }, [isOpen]);


  const handleConfirm = () => {
    if (selection && originalVideoWidth && originalVideoHeight) {
        // Ensure coordinates are within the original video bounds just in case
        const confirmedSelection = {
            x1: Math.max(0, Math.min(selection.x1, originalVideoWidth)),
            y1: Math.max(0, Math.min(selection.y1, originalVideoHeight)),
            x2: Math.max(0, Math.min(selection.x2, originalVideoWidth)),
            y2: Math.max(0, Math.min(selection.y2, originalVideoHeight)),
        };
        // Ensure x1 < x2 and y1 < y2 again
        if (confirmedSelection.x1 < confirmedSelection.x2 && confirmedSelection.y1 < confirmedSelection.y2) {
            onConfirm(confirmedSelection);
        } else {
            console.error("Invalid selection for confirmation (zero width/height).");
            // Optionally, add a toast message here
        }
    } else {
        console.error("No valid selection to confirm or missing video dimensions.");
    }
  };

  const currentSelectionStyle: React.CSSProperties = {};
  if (startPoint && endPoint) {
    currentSelectionStyle.left = `${Math.min(startPoint.x, endPoint.x)}px`;
    currentSelectionStyle.top = `${Math.min(startPoint.y, endPoint.y)}px`;
    currentSelectionStyle.width = `${Math.abs(endPoint.x - startPoint.x)}px`;
    currentSelectionStyle.height = `${Math.abs(endPoint.y - startPoint.y)}px`;
  }
  
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Crop className="mr-2 h-6 w-6 text-primary" />
            Select Region to Process for: {videoName || "Video"}
          </DialogTitle>
          <DialogDescription>
            Click and drag on the video to select the area you want to process.
            The coordinates will be scaled to the original video dimensions.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 relative aspect-video bg-muted flex items-center justify-center">
          {videoSrc ? (
            <div
              ref={overlayRef}
              className="absolute inset-0 cursor-crosshair z-10"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { if(isDrawing) handleMouseUp(); }} // Finalize if mouse leaves while drawing
            >
              {/* Video player sits behind the overlay */}
              <VideoPlayer src={videoSrc} className="w-full h-full pointer-events-none" />

              {/* Drawn selection rectangle */}
              {isDrawing && startPoint && endPoint && (
                <div
                  className="absolute border-2 border-dashed border-yellow-400 bg-yellow-400 bg-opacity-20 pointer-events-none"
                  style={currentSelectionStyle}
                />
              )}
            </div>
          ) : (
            <p>Video preview unavailable.</p>
          )}
        </div>
        
        {selection && (
          <div className="text-sm p-2 bg-secondary rounded-md">
            Selected (scaled): x1: {selection.x1}, y1: {selection.y1}, x2: {selection.x2}, y2: {selection.y2}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="!bg-primary hover:!bg-primary/90 text-primary-foreground"
            onClick={handleConfirm}
            disabled={!selection || (selection.x1 === selection.x2 || selection.y1 === selection.y2)}
          >
            Confirm Selection & Process
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
