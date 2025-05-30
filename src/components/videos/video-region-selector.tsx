
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SelectionCoordinates } from '@/lib/types';
import { VideoPlayer } from './video-player';
import { Crop, Loader2 } from 'lucide-react';

interface VideoRegionSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  videoSrc?: string;
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
  
  const [displayedVideoMetrics, setDisplayedVideoMetrics] = useState<{
    width: number;
    height: number;
    offsetX: number; // Offset of video content within fixedAspectContainerRef
    offsetY: number; // Offset of video content within fixedAspectContainerRef
  } | null>(null);

  const fixedAspectContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null); // This div is for drawing

  useEffect(() => {
    if (isOpen) {
      console.log('[VideoRegionSelector] Dialog opened. Resetting state. Original Dims from props:', { originalVideoWidth, originalVideoHeight });
      setIsDrawing(false);
      setStartPoint(null);
      setEndPoint(null);
      setSelection(null);
      setDisplayedVideoMetrics(null); 
    }
  }, [isOpen, originalVideoWidth, originalVideoHeight]);

  const handleVideoLoad = useCallback(() => {
    if (!fixedAspectContainerRef.current || !originalVideoWidth || !originalVideoHeight) {
      console.warn('[VideoRegionSelector] handleVideoLoad: fixedAspectContainerRef or original dimensions missing.');
      setDisplayedVideoMetrics(null);
      return;
    }
    
    const videoNativeWidth = Number(originalVideoWidth);
    const videoNativeHeight = Number(originalVideoHeight);

    if (videoNativeWidth <= 0 || videoNativeHeight <= 0) {
      console.warn('[VideoRegionSelector] Original dimensions from props are invalid. Cannot calculate display metrics.');
      setDisplayedVideoMetrics(null);
      return;
    }
    
    const containerRect = fixedAspectContainerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    if (containerWidth <= 0 || containerHeight <= 0) {
      console.warn('[VideoRegionSelector] Fixed aspect container has 0x0 dimensions.');
      setDisplayedVideoMetrics(null);
      return;
    }

    const videoActualAspectRatio = videoNativeWidth / videoNativeHeight;
    const containerAspectRatio = containerWidth / containerHeight;

    let newDisplayedWidth, newDisplayedHeight, newOffsetX, newOffsetY;

    if (videoActualAspectRatio > containerAspectRatio) { // Video wider than container (letterboxed)
      newDisplayedWidth = containerWidth;
      newDisplayedHeight = containerWidth / videoActualAspectRatio;
      newOffsetX = 0;
      newOffsetY = (containerHeight - newDisplayedHeight) / 2;
    } else { // Video taller or same AR as container (pillarboxed or exact fit)
      newDisplayedHeight = containerHeight;
      newDisplayedWidth = containerHeight * videoActualAspectRatio;
      newOffsetY = 0;
      newOffsetX = (containerWidth - newDisplayedWidth) / 2;
    }
    
    console.log('[VideoRegionSelector] handleVideoLoad: Calculated Display Metrics:', {
        containerWidth, containerHeight, videoNativeWidth, videoNativeHeight,
        videoActualAspectRatio, containerAspectRatio,
        newDisplayedWidth, newDisplayedHeight, newOffsetX, newOffsetY
    });

    setDisplayedVideoMetrics({
      width: newDisplayedWidth,
      height: newDisplayedHeight,
      offsetX: Math.round(newOffsetX), // Round offsets
      offsetY: Math.round(newOffsetY), // Round offsets
    });
  }, [originalVideoWidth, originalVideoHeight]);


  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!displayedVideoMetrics || !overlayRef.current) {
        console.warn("[VideoRegionSelector] MouseDown: displayedVideoMetrics or overlayRef not ready. Cannot start drawing.");
        return;
    }
    // Use clientX/Y and getBoundingClientRect for coordinates relative to the overlayRef
    const rect = overlayRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    console.log('[VideoRegionSelector] MouseDown on active overlay. ClientX/Y:', { cx: event.clientX, cy: event.clientY }, 'RectLeft/Top:', { rl: rect.left, rt: rect.top }, 'Calculated x/y:', { x, y });
    setIsDrawing(true);
    setStartPoint({ x, y });
    setEndPoint({ x, y }); 
    setSelection(null);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint || !overlayRef.current || !displayedVideoMetrics) return;
    
    const rect = overlayRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Clamp coordinates to be within the overlay bounds (which represents the visible video area)
    const clampedX = Math.max(0, Math.min(x, displayedVideoMetrics.width));
    const clampedY = Math.max(0, Math.min(y, displayedVideoMetrics.height));
    setEndPoint({ x: clampedX, y: clampedY });
  };
  
  const handleMouseUp = () => {
    console.log('[VideoRegionSelector] MouseUp triggered.');
    if (!isDrawing || !startPoint || !endPoint || !overlayRef.current || !displayedVideoMetrics) {
      console.log('[VideoRegionSelector] MouseUp: Aborting, not drawing or missing refs/video metrics.', { isDrawing, startPoint, endPoint, overlayRefExists: !!overlayRef.current, displayedVideoMetrics });
      setIsDrawing(false);
      return;
    }

    const videoNativeWidth = Number(originalVideoWidth) || 0;
    const videoNativeHeight = Number(originalVideoHeight) || 0;

    if (videoNativeWidth <= 0 || videoNativeHeight <= 0) {
        console.error('[VideoRegionSelector] MouseUp: Aborting, original video dimensions (from props) are invalid or missing.', { originalVideoWidth, originalVideoHeight });
        setIsDrawing(false);
        setSelection(null); setStartPoint(null); setEndPoint(null);
        return;
    }
    
    const { width: displayedContentWidth, height: displayedContentHeight } = displayedVideoMetrics;

    if (displayedContentWidth <= 0 || displayedContentHeight <= 0) {
        console.error('[VideoRegionSelector] MouseUp: Aborting, displayed content dimensions are invalid.', { displayedContentWidth, displayedContentHeight });
        setIsDrawing(false);
        setSelection(null); setStartPoint(null); setEndPoint(null);
        return;
    }
    
    const x1_on_overlay = Math.min(startPoint.x, endPoint.x);
    const y1_on_overlay = Math.min(startPoint.y, endPoint.y);
    const x2_on_overlay = Math.max(startPoint.x, endPoint.x);
    const y2_on_overlay = Math.max(startPoint.y, endPoint.y);

    if (x1_on_overlay >= x2_on_overlay || y1_on_overlay >= y2_on_overlay) {
        console.warn("[VideoRegionSelector] MouseUp: Selection on active overlay resulted in zero or negative width/height. Resetting selection.");
        setSelection(null); setStartPoint(null); setEndPoint(null);
        setIsDrawing(false);
        return;
    }

    const scaleX = videoNativeWidth / displayedContentWidth;
    const scaleY = videoNativeHeight / displayedContentHeight;
    console.log('[VideoRegionSelector] MouseUp: Scaling factors (originalVideoDim / displayedContentDim):', { scaleX, scaleY });

    const finalCoords: SelectionCoordinates = {
      x1: Math.round(x1_on_overlay * scaleX),
      y1: Math.round(y1_on_overlay * scaleY),
      x2: Math.round(x2_on_overlay * scaleX),
      y2: Math.round(y2_on_overlay * scaleY),
    };
    console.log('[VideoRegionSelector] MouseUp: Final Coords (scaled & rounded to original video dimensions):', finalCoords);
    
    if (finalCoords.x1 >= finalCoords.x2 || finalCoords.y1 >= finalCoords.y2) {
        console.warn("[VideoRegionSelector] MouseUp: Selection resulted in zero or negative width/height after scaling. Resetting selection.");
        setSelection(null);
    } else {
        setSelection(finalCoords);
        console.log("[VideoRegionSelector] MouseUp: Successfully set selection (final scaled coords):", finalCoords);
    }
    setIsDrawing(false);
  };
  
  const handleConfirm = () => {
    if (selection && originalVideoWidth && originalVideoHeight) {
        const confirmedSelection = { // Ensure coords are within video bounds before confirming
            x1: Math.max(0, Math.min(selection.x1, originalVideoWidth)),
            y1: Math.max(0, Math.min(selection.y1, originalVideoHeight)),
            x2: Math.max(0, Math.min(selection.x2, originalVideoWidth)),
            y2: Math.max(0, Math.min(selection.y2, originalVideoHeight)),
        };
        if (confirmedSelection.x1 < confirmedSelection.x2 && confirmedSelection.y1 < confirmedSelection.y2) {
            console.log('[VideoRegionSelector] Confirming selection:', confirmedSelection);
            onConfirm(confirmedSelection);
        } else {
            console.error("[VideoRegionSelector] Invalid selection for confirmation (zero width/height). Should not happen if button enabled.", confirmedSelection);
        }
    } else {
        console.error("[VideoRegionSelector] No valid selection to confirm or missing video dimensions.");
    }
  };

  const currentSelectionStyle: React.CSSProperties = {};
  if (isDrawing && startPoint && endPoint && displayedVideoMetrics && Math.abs(endPoint.x - startPoint.x) > 0 && Math.abs(endPoint.y - startPoint.y) > 0) {
    currentSelectionStyle.left = `${Math.round(Math.min(startPoint.x, endPoint.x))}px`;
    currentSelectionStyle.top = `${Math.round(Math.min(startPoint.y, endPoint.y))}px`;
    currentSelectionStyle.width = `${Math.round(Math.abs(endPoint.x - startPoint.x))}px`;
    currentSelectionStyle.height = `${Math.round(Math.abs(endPoint.y - startPoint.y))}px`;
  } else if (!isDrawing && selection && displayedVideoMetrics && selection.x2 > selection.x1 && selection.y2 > selection.y1) {
    if (displayedVideoMetrics.width > 0 && displayedVideoMetrics.height > 0 && originalVideoWidth && originalVideoHeight && originalVideoWidth > 0 && originalVideoHeight > 0) {
        const displayScaleX = displayedVideoMetrics.width / originalVideoWidth;
        const displayScaleY = displayedVideoMetrics.height / originalVideoHeight;
        currentSelectionStyle.left = `${Math.round(selection.x1 * displayScaleX)}px`;
        currentSelectionStyle.top = `${Math.round(selection.y1 * displayScaleY)}px`;
        currentSelectionStyle.width = `${Math.round((selection.x2 - selection.x1) * displayScaleX)}px`;
        currentSelectionStyle.height = `${Math.round((selection.y2 - selection.y1) * displayScaleY)}px`;
    }
  }
  
  const isConfirmDisabled = !selection || (selection.x1 >= selection.x2 || selection.y1 >= selection.y2);

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
            Original Dimensions: {originalVideoWidth && originalVideoHeight ? `${originalVideoWidth}x${originalVideoHeight}px` : 'Not available'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 bg-muted flex items-center justify-center">
          <div 
            ref={fixedAspectContainerRef}
            className="relative w-full max-w-[70vw] sm:max-w-[60vw] md:max-w-xl lg:max-w-2xl aspect-video bg-black overflow-hidden"
          >
            {videoSrc && originalVideoWidth && originalVideoHeight ? (
              <>
                <VideoPlayer 
                  key={videoSrc} 
                  src={videoSrc} 
                  className="absolute top-0 left-0 w-full h-full" 
                  onLoadedMetadata={handleVideoLoad} 
                />
                {displayedVideoMetrics ? (
                  <div
                    ref={overlayRef}
                    className="absolute cursor-crosshair z-10" 
                    style={{
                      width: `${displayedVideoMetrics.width}px`,
                      height: `${displayedVideoMetrics.height}px`,
                      top: `${displayedVideoMetrics.offsetY}px`,
                      left: `${displayedVideoMetrics.offsetX}px`,
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => { if(isDrawing) handleMouseUp(); }} 
                  >
                    {Object.keys(currentSelectionStyle).length > 0 && 
                     parseFloat(currentSelectionStyle.width as string) > 0 && 
                     parseFloat(currentSelectionStyle.height as string) > 0 && (
                      <div
                        className="absolute border-2 border-dashed border-yellow-400 bg-yellow-400 bg-opacity-20 pointer-events-none"
                        style={currentSelectionStyle}
                      />
                    )}
                  </div>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/70 pointer-events-none z-20">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <p className="text-sm">Loading video & calculating dimensions...</p>
                    </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-destructive p-4 text-center">
                  Video preview or original dimensions unavailable. Cannot select region. <br />
                  (Src: {videoSrc ? 'Available' : 'Missing'}, Width: {originalVideoWidth || 'Missing'}, Height: {originalVideoHeight || 'Missing'})
                </p>
              </div>
            )}
          </div>
        </div>
        
        {selection && (
          <div className="text-sm p-2 bg-secondary rounded-md">
            Selected (scaled to original video): x1: {selection.x1}, y1: {selection.y1}, x2: {selection.x2}, y2: {selection.y2}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-end pt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="!bg-primary hover:!bg-primary/90 text-primary-foreground"
            onClick={handleConfirm}
            disabled={isConfirmDisabled || !displayedVideoMetrics}
          >
            Confirm Selection & Process
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

