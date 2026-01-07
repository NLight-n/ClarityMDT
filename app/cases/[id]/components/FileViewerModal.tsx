"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, X, ZoomIn, ZoomOut, RotateCcw, Move } from "lucide-react";

interface FileViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachmentId: string;
  fileName: string;
  fileType: string;
}

export function FileViewerModal({
  open,
  onOpenChange,
  attachmentId,
  fileName,
  fileType,
}: FileViewerModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  
  // Zoom and pan state for images
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const isImage = fileType.startsWith("image/");
  const isPdf = fileType === "application/pdf" || 
                fileType === "application/msword" || 
                fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                fileType === "application/vnd.ms-excel" ||
                fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
                fileType === "application/vnd.ms-powerpoint" ||
                fileType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  useEffect(() => {
    if (open && attachmentId) {
      setLoading(true);
      setError(null);
      // Reset zoom and pan when opening a new file
      setZoom(1);
      setPan({ x: 0, y: 0 });
      
      // Fetch the file stream
      fetch(`/api/attachments/stream/${attachmentId}`)
        .then(async (response) => {
          if (!response.ok) {
            // Try to get error details from response
            let errorMessage = response.statusText;
            try {
              const errorData = await response.json();
              if (errorData.error) {
                errorMessage = errorData.error;
                if (errorData.details) {
                  errorMessage += `: ${errorData.details}`;
                }
              }
            } catch {
              // If JSON parsing fails, use status text
            }
            throw new Error(`Failed to load file: ${errorMessage}`);
          }
          return response.blob();
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setObjectUrl(url);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error loading file:", err);
          setError(err.message || "Failed to load file");
          setLoading(false);
        });
    }

    // Cleanup: revoke object URL when modal closes or component unmounts
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [open, attachmentId]);

  // Zoom functions
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 5)); // Max zoom 5x
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5)); // Min zoom 0.5x
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Pan functions (drag to pan)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, zoom, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isImage && e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.max(0.5, Math.min(5, prev + delta)));
    }
  }, [isImage]);

  const handleDownload = () => {
    window.open(`/api/attachments/file/${attachmentId}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-6xl w-full h-[90vh] p-0 flex flex-col"
        aria-describedby="file-viewer-description"
      >
        <span id="file-viewer-description" className="sr-only">
          File viewer for {fileName}
        </span>
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0 pr-12">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-lg font-semibold truncate flex-1 min-w-0">
              {fileName}
            </DialogTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isImage && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleZoomOut}
                    title="Zoom Out (Ctrl + Scroll)"
                    disabled={zoom <= 0.5}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleResetZoom}
                    title="Reset Zoom"
                    disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleZoomIn}
                    title="Zoom In (Ctrl + Scroll)"
                    disabled={zoom >= 5}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  {zoom > 1 && (
                    <div className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
                      <Move className="h-3 w-3" />
                      <span>{Math.round(zoom * 100)}%</span>
                    </div>
                  )}
                </>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={handleDownload}
                title="Download"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto p-4 bg-muted/30 flex items-center justify-center">
          {loading && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {fileType.includes("word") || fileType.includes("excel") || fileType.includes("powerpoint")
                  ? "Converting to PDF..."
                  : "Loading file..."}
              </p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-4 text-center">
              <X className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-sm font-medium text-destructive mb-1">
                  Failed to load file
                </p>
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download instead
              </Button>
            </div>
          )}

          {!loading && !error && objectUrl && (
            <div className="w-full h-full flex items-center justify-center relative">
              {isImage ? (
                <div
                  ref={imageContainerRef}
                  className="w-full h-full flex items-center justify-center overflow-hidden cursor-move"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                  style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
                >
                  <img
                    ref={imageRef}
                    src={objectUrl}
                    alt={fileName}
                    className="max-w-full max-h-full object-contain select-none"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transition: isDragging ? "none" : "transform 0.1s ease-out",
                    }}
                    draggable={false}
                  />
                </div>
              ) : isPdf ? (
                <iframe
                  src={objectUrl}
                  className="w-full h-full border-0"
                  title={fileName}
                />
              ) : (
                <div className="text-center p-8">
                  <p className="text-sm text-muted-foreground mb-4">
                    Preview not available for this file type
                  </p>
                  <Button onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download file
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

