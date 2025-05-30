
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SelectionCoordinates } from '@/lib/types';
import { VideoPlayer } from './video-player';
import { Crop } from 'lucide-react';

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
  
  const overlayRef = useRef<HTMLDivElement>(null);

  const videoAspectRatio = originalVideoWidth && originalVideoHeight && originalVideoHeight > 0 
    ? originalVideoWidth / originalVideoHeight 
    : 16 / 9; // Default to 16:9 if dims not available or invalid to prevent division by zero

  useEffect(() => {
    if (isOpen) {
      console.log('[VideoRegionSelector] Dialog opened. Resetting state. Original Dims:', { originalVideoWidth, originalVideoHeight }, "Aspect Ratio:", videoAspectRatio);
      setIsDrawing(false);
      setStartPoint(null);
      setEndPoint(null);
      setSelection(null);
    }
  }, [isOpen, originalVideoWidth, originalVideoHeight, videoAspectRatio]);

  const getRelativeCoords = (clientX: number, clientY: number) => {
    if (!overlayRef.current) return { x: 0, y: 0, valid: false };
    const rect = overlayRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        console.warn('[VideoRegionSelector] Overlay dimensions are zero during getRelativeCoords.');
        return { x: 0, y: 0, valid: false };
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      valid: true
    };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return;
    const { x, y, valid } = getRelativeCoords(event.clientX, event.clientY);
    if (!valid) {
      console.warn("[VideoRegionSelector] MouseDown: Invalid relative coords.");
      return;
    }
    console.log('[VideoRegionSelector] MouseDown at (display):', { x, y });
    setIsDrawing(true);
    setStartPoint({ x, y });
    setEndPoint({ x, y }); 
    setSelection(null);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint || !overlayRef.current) return;
    const { x, y, valid } = getRelativeCoords(event.clientX, event.clientY);
    if (!valid) return;
    setEndPoint({ x, y });
  };

  const handleMouseUp = () => {
    console.log('[VideoRegionSelector] MouseUp triggered.');
    if (!isDrawing || !startPoint || !endPoint || !overlayRef.current) {
      console.log('[VideoRegionSelector] MouseUp: Aborting, not drawing or missing refs/points.', { isDrawing, startPoint, endPoint, overlayRefExists: !!overlayRef.current });
      setIsDrawing(false);
      return;
    }

    if (!originalVideoWidth || !originalVideoHeight || originalVideoWidth <= 0 || originalVideoHeight <= 0) {
        console.error('[VideoRegionSelector] MouseUp: Aborting, original video dimensions are invalid or missing.', { originalVideoWidth, originalVideoHeight });
        setIsDrawing(false);
        setSelection(null); setStartPoint(null); setEndPoint(null);
        return;
    }
    
    const overlayRect = overlayRef.current.getBoundingClientRect();
    const displayedVideoWidth = overlayRect.width;
    const displayedVideoHeight = overlayRect.height;

    if (displayedVideoWidth <= 0 || displayedVideoHeight <= 0) {
        console.error('[VideoRegionSelector] MouseUp: Aborting, displayed video dimensions are zero or invalid from overlayRef.', { displayedVideoWidth, displayedVideoHeight });
        setIsDrawing(false);
        setSelection(null); setStartPoint(null); setEndPoint(null);
        return;
    }
    
    console.log('[VideoRegionSelector] MouseUp: Displayed Dims (from overlayRef):', { displayedVideoWidth, displayedVideoHeight });
    console.log('[VideoRegionSelector] MouseUp: Original Video Dims:', { originalVideoWidth, originalVideoHeight });

    const boundedStartX = Math.max(0, Math.min(startPoint.x, displayedVideoWidth));
    const boundedStartY = Math.max(0, Math.min(startPoint.y, displayedVideoHeight));
    const boundedEndX = Math.max(0, Math.min(endPoint.x, displayedVideoWidth));
    const boundedEndY = Math.max(0, Math.min(endPoint.y, displayedVideoHeight));
    
    const x1_display = Math.min(boundedStartX, boundedEndX);
    const y1_display = Math.min(boundedStartY, boundedEndY);
    const x2_display = Math.max(boundedStartX, boundedEndX);
    const y2_display = Math.max(boundedStartY, boundedEndY);

    if (x1_display >= x2_display || y1_display >= y2_display) {
        console.warn("[VideoRegionSelector] MouseUp: Selection resulted in zero or negative width/height on display. Resetting selection.");
        setSelection(null); setStartPoint(null); setEndPoint(null);
        setIsDrawing(false);
        return;
    }

    const scaleX = originalVideoWidth / displayedVideoWidth;
    const scaleY = originalVideoHeight / displayedVideoHeight;
    console.log('[VideoRegionSelector] MouseUp: Scaling factors:', { scaleX, scaleY });

    const finalCoords: SelectionCoordinates = {
      x1: Math.round(x1_display * scaleX),
      y1: Math.round(y1_display * scaleY),
      x2: Math.round(x2_display * scaleX),
      y2: Math.round(y2_display * scaleY),
    };
    console.log('[VideoRegionSelector] MouseUp: Final Coords (scaled & rounded):', finalCoords);
    
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
        const confirmedSelection = {
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
  if (startPoint && endPoint) {
    currentSelectionStyle.left = `${Math.min(startPoint.x, endPoint.x)}px`;
    currentSelectionStyle.top = `${Math.min(startPoint.y, endPoint.y)}px`;
    currentSelectionStyle.width = `${Math.abs(endPoint.x - startPoint.x)}px`;
    currentSelectionStyle.height = `${Math.abs(endPoint.y - startPoint.y)}px`;
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
            The coordinates will be scaled to the original video dimensions.
            Original Dimensions: {originalVideoWidth && originalVideoHeight ? `${originalVideoWidth}x${originalVideoHeight}px` : 'Not available'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 bg-muted flex items-center justify-center"> {/* Outer container for centering */}
          {videoSrc && originalVideoWidth && originalVideoHeight && originalVideoHeight > 0 ? (
            <div 
              className="relative w-full max-w-[70vw] sm:max-w-[60vw] md:max-w-xl lg:max-w-2xl" // Responsive max width for the aspect container
            >
              {/* This inner div enforces the aspect ratio */}
              <div 
                style={{ 
                  position: 'relative', 
                  width: '100%', 
                  paddingBottom: `${(1 / videoAspectRatio) * 100}%` // Dynamic aspect ratio
                }}
              >
                {/* Overlay and VideoPlayer are absolutely positioned to fill the aspect ratio div */}
                <div
                  ref={overlayRef}
                  className="absolute top-0 left-0 w-full h-full cursor-crosshair z-10"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => { if(isDrawing) handleMouseUp(); }} 
                >
                  <VideoPlayer 
                    src={videoSrc} 
                    className="absolute top-0 left-0 w-full h-full pointer-events-none" 
                  />
                  {startPoint && endPoint && Math.abs(endPoint.x - startPoint.x) > 0 && Math.abs(endPoint.y - startPoint.y) > 0 && (
                    <div
                      className="absolute border-2 border-dashed border-yellow-400 bg-yellow-400 bg-opacity-20 pointer-events-none"
                      style={currentSelectionStyle}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-destructive p-4 text-center">
              Video preview or original dimensions unavailable. Cannot select region. <br />
              (Src: {videoSrc ? 'Available' : 'Missing'}, Width: {originalVideoWidth || 'Missing'}, Height: {originalVideoHeight || 'Missing'})
            </p>
          )}
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
            disabled={isConfirmDisabled}
          >
            Confirm Selection & Process
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

