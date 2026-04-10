"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Moon, Sun, MonitorPlay, FileText, Download, Eye, Folder } from "lucide-react";
import { RichTextEditor } from "@/components/editors/RichTextEditor";
import { format } from "date-fns";
import { FileViewerModal } from "./FileViewerModal";
import { FileIcon, defaultStyles } from "react-file-icon";

interface PresentationModeProps {
  caseData: any;
  onClose: () => void;
}

export function PresentationMode({ caseData, onClose }: PresentationModeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<any | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const elem = document.documentElement;
    if (elem && elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {
        // Silently catch exceptions to prevent console noise on restricted user gesture events
      });
    }

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        onCloseRef.current();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(console.error);
      }
    };
  }, []);

  const toggleTheme = () => setIsDark(!isDark);

  const handleOpenOHIF = (url: string) => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    }
    // onClose is triggered natively by fullscreenchange via the effect above
    window.open(url, "_blank");
  };

  const handleViewAttachment = (attachment: any) => {
    setViewingAttachment(attachment);
    setViewerModalOpen(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (fileName: string, fileType: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    if (fileType.startsWith("image/")) {
      return <div className="text-blue-500 flex items-center justify-center w-8 h-8"><FileText /></div>;
    }
    const fileIconProps = extension && defaultStyles[extension as keyof typeof defaultStyles]
      ? { ...defaultStyles[extension as keyof typeof defaultStyles] }
      : {};
    return (
      <div className="w-8 h-8 flex items-center justify-center">
        <FileIcon extension={extension || undefined} {...fileIconProps} labelColor="#ffffff" labelUppercase={false} />
      </div>
    );
  };

  // Colors
  const bgClass = isDark ? "bg-slate-950 text-slate-50" : "bg-slate-50 text-slate-900";
  const cardClass = isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const textMutedClass = isDark ? "text-slate-400" : "text-slate-500";
  const proseClass = isDark ? "prose-invert" : "";

  // Data aggregations
  const nonBundleAttachments = caseData.attachments?.filter((a: any) => !a.isDicomBundle) || [];
  const dicomBundles = caseData.attachments?.filter((a: any) => a.isDicomBundle) || [];
  const webLinks = caseData.links || [];

  return (
    <div 
      ref={containerRef} 
      className={`fixed inset-0 z-50 overflow-y-auto w-full h-full pb-20 transition-colors duration-200 ${bgClass} ${isDark ? 'dark' : ''}`}
    >
      <div className="sticky top-0 z-10 p-4 border-b flex items-center justify-between shadow-sm backdrop-blur-md bg-opacity-90 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <MonitorPlay className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">Presentation Mode</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={isDark ? "secondary" : "outline"} size="icon" onClick={toggleTheme} title="Toggle Light/Dark Theme">
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button variant={isDark ? "secondary" : "outline"} size="icon" onClick={() => document.exitFullscreen()} title="Exit Presentation">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto mt-8 space-y-8 px-6">
        
        {/* 1. Header Summary / Patient Details */}
        <div className={`p-6 rounded-xl border shadow-sm ${cardClass}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className={`text-sm tracking-wide uppercase font-semibold ${textMutedClass}`}>Patient Name</p>
              <p className="text-2xl font-bold mt-1">{caseData.patientName}</p>
            </div>
            <div>
              <p className={`text-sm tracking-wide uppercase font-semibold ${textMutedClass}`}>Age / Gender</p>
              <p className="text-xl font-medium mt-1">{caseData.age} / {caseData.gender}</p>
            </div>
            <div>
              <p className={`text-sm tracking-wide uppercase font-semibold ${textMutedClass}`}>MRN</p>
              <p className="text-xl font-medium mt-1">{caseData.mrn || "—"}</p>
            </div>
            <div>
              <p className={`text-sm tracking-wide uppercase font-semibold ${textMutedClass}`}>Department</p>
              <p className="text-xl font-medium mt-1">{caseData.presentingDepartment?.name || "—"}</p>
            </div>
          </div>
        </div>

        {/* 2. Clinical Details */}
        {caseData.clinicalDetails?.content?.length > 0 && (
          <div className={`p-6 rounded-xl border shadow-sm ${cardClass}`}>
            <h2 className="text-xl font-bold mb-4 pb-2 border-b border-border/50">Clinical Details</h2>
            <div className={`prose max-w-none ${proseClass}`}>
              <RichTextEditor content={caseData.clinicalDetails} editable={false} caseId={caseData.id} imageType="clinical" />
            </div>
          </div>
        )}

        {/* 3. Radiology Findings */}
        {caseData.radiologyFindings?.content?.length > 0 && (
          <div className={`p-6 rounded-xl border shadow-sm ${cardClass}`}>
            <h2 className="text-xl font-bold mb-4 pb-2 border-b border-border/50">Radiology Findings</h2>
            <div className={`prose max-w-none ${proseClass}`}>
              <RichTextEditor content={caseData.radiologyFindings} editable={false} caseId={caseData.id} imageType="radiology" />
            </div>
          </div>
        )}

        {/* 4. Pathology Findings */}
        {caseData.pathologyFindings?.content?.length > 0 && (
          <div className={`p-6 rounded-xl border shadow-sm ${cardClass}`}>
            <h2 className="text-xl font-bold mb-4 pb-2 border-b border-border/50">Pathology Findings</h2>
            <div className={`prose max-w-none ${proseClass}`}>
              <RichTextEditor content={caseData.pathologyFindings} editable={false} caseId={caseData.id} imageType="pathology" />
            </div>
          </div>
        )}

        {/* 5. Diagnosis Stage */}
        {caseData.diagnosisStage && (
          <div className={`p-6 rounded-xl border shadow-sm ${cardClass}`}>
            <h2 className="text-xl font-bold mb-4">Diagnosis Stage</h2>
            <div className="whitespace-pre-wrap text-lg leading-relaxed">{caseData.diagnosisStage}</div>
          </div>
        )}

        {/* 6. Treatment Plan */}
        {caseData.treatmentPlan && (
          <div className={`p-6 rounded-xl border shadow-sm ${cardClass}`}>
            <h2 className="text-xl font-bold mb-4">Treatment Plan</h2>
            <div className="whitespace-pre-wrap text-lg leading-relaxed">{caseData.treatmentPlan}</div>
          </div>
        )}

        {/* 7. Discussion Question */}
        {caseData.question && (
          <div className={`p-6 rounded-xl border-l-4 border-l-primary shadow-sm ${cardClass}`}>
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">?</span> 
              Discussion Question
            </h2>
            <div className="whitespace-pre-wrap text-lg font-medium leading-relaxed">{caseData.question}</div>
          </div>
        )}

        {/* 8. DICOM and Links */}
        {(webLinks.length > 0 || dicomBundles.length > 0) && (
          <div className={`p-6 rounded-xl border shadow-sm ${cardClass}`}>
            <h2 className="text-xl font-bold mb-4 pb-2 border-b border-border/50">DICOM & Imaging Links</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dicomBundles.map((bundle: any) => (
                <div key={bundle.id} className="flex items-center p-3 rounded-lg border border-border/50 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer" onClick={() => handleOpenOHIF(`/ohif-viewer/viewer?url=/api/dicom-manifest/${bundle.id}`)}>
                  <Folder className="h-10 w-10 text-blue-600 mr-4 flex-shrink-0" />
                  <div className="flex-1 overflow-hidden">
                    <p className="font-semibold truncate text-base">{bundle.fileName.replace("_manifest.json", "")}</p>
                    <p className={`text-sm ${textMutedClass}`}>DICOM Local Upload</p>
                  </div>
                  <Button size="sm" variant="secondary" className="ml-2">Open OHIF</Button>
                </div>
              ))}
              {webLinks.map((link: any) => (
                <div key={link.id} className="flex items-center p-3 rounded-lg border border-border/50 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer" onClick={() => handleOpenOHIF(`/ohif-viewer/viewer?url=${encodeURIComponent(link.url)}`)}>
                  <MonitorPlay className="h-10 w-10 text-indigo-600 mr-4 flex-shrink-0" />
                  <div className="flex-1 overflow-hidden">
                    <p className="font-semibold truncate text-base">{link.name}</p>
                    <p className={`text-sm ${textMutedClass}`}>{link.type === "PACSONE" ? "PacsOne Format" : "Web URL"}</p>
                  </div>
                  <Button size="sm" variant="secondary" className="ml-2">Open OHIF</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 9. Attachments */}
        {nonBundleAttachments.length > 0 && (
          <div className={`p-6 rounded-xl border shadow-sm ${cardClass}`}>
            <h2 className="text-xl font-bold mb-4 pb-2 border-b border-border/50">Attachments</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {nonBundleAttachments.map((attachment: any) => (
                <div key={attachment.id} className="flex items-center p-3 rounded-lg border border-border/50 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer" onClick={() => handleViewAttachment(attachment)}>
                  <div className="mr-3 flex-shrink-0">{getFileIcon(attachment.fileName, attachment.fileType)}</div>
                  <div className="flex-1 overflow-hidden">
                    <p className="font-semibold truncate text-sm" title={attachment.fileName}>{attachment.fileName}</p>
                    <p className={`text-xs ${textMutedClass}`}>{formatFileSize(attachment.fileSize)}</p>
                  </div>
                  <Eye className={`w-4 h-4 ml-2 ${textMutedClass}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 10. Specialists Opinions */}
        {caseData.specialistsOpinions?.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold mt-8 mb-4">Specialists&apos; Opinions</h2>
            {caseData.specialistsOpinions.map((opinion: any) => (
              <div key={opinion.id} className={`p-6 rounded-xl border shadow-sm ${cardClass}`}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/50">
                  <div>
                    <h3 className="font-bold text-lg">{opinion.consultant?.name}</h3>
                    <p className={`text-sm ${textMutedClass}`}>{opinion.department?.name}</p>
                  </div>
                  <p className={`text-sm ${textMutedClass}`}>{format(new Date(opinion.createdAt), "MMM d, yyyy h:mm a")}</p>
                </div>
                <div className="whitespace-pre-wrap text-lg leading-relaxed">{opinion.opinionText}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingAttachment && (
        <FileViewerModal
          open={viewerModalOpen}
          onOpenChange={setViewerModalOpen}
          attachmentId={viewingAttachment.id}
          fileName={viewingAttachment.fileName}
          fileType={viewingAttachment.fileType}
        />
      )}
    </div>
  );
}
