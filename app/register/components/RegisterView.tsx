"use client";

import { useState } from "react";
import { RegisterCaseCard } from "./RegisterCaseCard";
import { CaseStatus, Gender } from "@prisma/client";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Case {
  id: string;
  patientName: string;
  mrn: string | null;
  age: number;
  gender: Gender;
  presentingDepartment: {
    name: string;
  };
  clinicalDetails: string;
  diagnosisStage: string;
  status: CaseStatus;
  radiologyFindings: any;
  pathologyFindings: any;
  followUp: string | null;
  _count: {
    attachments: number;
    specialistsOpinions: number;
  };
}

interface RegisterViewProps {
  cases: Case[];
  loading?: boolean;
  currentMeetingId?: string;
}

const CASES_PER_PAGE_DESKTOP = 6; // 3 on left, 3 on right
const CASES_PER_PAGE_MOBILE = 3; // 3 on single page

export function RegisterView({ cases, loading, currentMeetingId }: RegisterViewProps) {
  const [currentPage, setCurrentPage] = useState(0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 border rounded-lg">
        <p className="text-muted-foreground">No cases for this meeting.</p>
      </div>
    );
  }

  // Calculate pages separately for mobile and desktop
  const totalPagesMobile = Math.ceil(cases.length / CASES_PER_PAGE_MOBILE);
  const totalPagesDesktop = Math.ceil(cases.length / CASES_PER_PAGE_DESKTOP);
  
  // For mobile: 3 cases per page
  const startIndexMobile = currentPage * CASES_PER_PAGE_MOBILE;
  const endIndexMobile = startIndexMobile + CASES_PER_PAGE_MOBILE;
  const mobileCases = cases.slice(startIndexMobile, endIndexMobile);
  
  // For desktop: 6 cases per page (3 left, 3 right)
  const startIndexDesktop = currentPage * CASES_PER_PAGE_DESKTOP;
  const endIndexDesktop = startIndexDesktop + CASES_PER_PAGE_DESKTOP;
  const displayCases = cases.slice(startIndexDesktop, endIndexDesktop);
  
  // Split into left and right pages for desktop
  const leftPageCases = displayCases.slice(0, 3);
  const rightPageCases = displayCases.slice(3, 6);

  const hasPreviousPageMobile = currentPage > 0;
  const hasNextPageMobile = currentPage < totalPagesMobile - 1;
  const hasPreviousPageDesktop = currentPage > 0;
  const hasNextPageDesktop = currentPage < totalPagesDesktop - 1;

  const handlePreviousPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    const maxPage = Math.max(totalPagesMobile - 1, totalPagesDesktop - 1);
    if (currentPage < maxPage) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div className="relative">
      {/* Mobile Layout - Single page with 3 cases, spiral binding on left */}
      <div className="md:hidden relative flex gap-0 h-[calc(100vh-280px)] max-h-[700px]">
        {/* Spiral Binding - Left side for mobile */}
        <div className="w-6 flex flex-col items-center justify-center bg-gradient-to-b from-gray-400 via-gray-500 to-gray-400 relative z-20 flex-shrink-0">
          {/* Spiral holes */}
          <div className="absolute inset-y-0 w-full flex flex-col items-center justify-around py-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-white shadow-inner"
                style={{
                  marginTop: i === 0 ? '0' : 'auto',
                  marginBottom: i === 7 ? '0' : 'auto',
                }}
              />
            ))}
          </div>
          {/* Binding shadow */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/10" />
        </div>

        {/* Single Page - 3 cases for mobile */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div className="bg-white border-2 border-gray-300 rounded-r-lg p-3 space-y-2 flex flex-col flex-1 min-h-0 shadow-lg relative overflow-hidden">
            {/* Paper texture effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-50/30 pointer-events-none" />
            <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(circle_at_50%_50%,black_1px,transparent_1px)] bg-[length:20px_20px] pointer-events-none" />
            
            <div className="relative z-10 space-y-2 flex flex-col flex-1 min-h-0">
              {mobileCases.map((caseData) => (
                <div key={caseData.id} className="flex-1 min-h-0">
                  <RegisterCaseCard caseData={caseData} meetingId={currentMeetingId} />
                </div>
              ))}
              {mobileCases.length < 3 && (
                Array.from({ length: 3 - mobileCases.length }).map((_, index) => (
                  <div key={`empty-mobile-${index}`} className="flex-1 min-h-0 border-2 border-dashed rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground text-xs">Empty slot</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Pagination Arrow - Left (Mobile) */}
        {totalPagesMobile > 1 && (
          <Button
            variant="outline"
            size="icon"
            onClick={handlePreviousPage}
            disabled={!hasPreviousPageMobile}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 z-30 h-10 w-10 rounded-full shadow-lg bg-white border-2 hover:bg-accent hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        {/* Pagination Arrow - Right (Mobile) */}
        {totalPagesMobile > 1 && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextPage}
            disabled={!hasNextPageMobile}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 z-30 h-10 w-10 rounded-full shadow-lg bg-white border-2 hover:bg-accent hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Desktop Layout - Two pages with 6 cases (3 left, 3 right), spiral binding in middle */}
      <div className="hidden md:flex relative gap-0 h-[calc(100vh-280px)] max-h-[700px]">
        {/* Pagination Arrow - Left (Desktop) */}
        {totalPagesDesktop > 1 && (
          <Button
            variant="outline"
            size="icon"
            onClick={handlePreviousPage}
            disabled={!hasPreviousPageDesktop}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-14 z-30 h-12 w-12 rounded-full shadow-lg bg-white border-2 hover:bg-accent hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
        )}

        {/* Left Page - 3 cases */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div className="bg-white border-2 border-gray-300 rounded-l-lg p-4 space-y-2 flex flex-col flex-1 min-h-0 shadow-lg relative overflow-hidden">
            {/* Paper texture effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-50/30 pointer-events-none" />
            <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(circle_at_50%_50%,black_1px,transparent_1px)] bg-[length:20px_20px] pointer-events-none" />
            
            <div className="relative z-10 space-y-2 flex flex-col flex-1 min-h-0">
              {leftPageCases.map((caseData) => (
                <div key={caseData.id} className="flex-1 min-h-0">
                  <RegisterCaseCard caseData={caseData} meetingId={currentMeetingId} />
                </div>
              ))}
              {leftPageCases.length < 3 && (
                Array.from({ length: 3 - leftPageCases.length }).map((_, index) => (
                  <div key={`empty-left-${index}`} className="flex-1 min-h-0 border-2 border-dashed rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground text-xs">Empty slot</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Spiral Binding - Middle for desktop */}
        <div className="w-8 flex flex-col items-center justify-center bg-gradient-to-r from-gray-400 via-gray-500 to-gray-400 relative z-20">
          {/* Spiral holes */}
          <div className="absolute inset-y-0 w-full flex flex-col items-center justify-around py-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full bg-white shadow-inner"
                style={{
                  marginTop: i === 0 ? '0' : 'auto',
                  marginBottom: i === 7 ? '0' : 'auto',
                }}
              />
            ))}
          </div>
          {/* Binding shadow */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/10" />
        </div>

        {/* Right Page - 3 cases */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          <div className="bg-white border-2 border-gray-300 rounded-r-lg p-4 space-y-2 flex flex-col flex-1 min-h-0 shadow-lg relative overflow-hidden">
            {/* Paper texture effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-gray-50/30 pointer-events-none" />
            <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(circle_at_50%_50%,black_1px,transparent_1px)] bg-[length:20px_20px] pointer-events-none" />
            
            <div className="relative z-10 space-y-2 flex flex-col flex-1 min-h-0">
              {rightPageCases.map((caseData) => (
                <div key={caseData.id} className="flex-1 min-h-0">
                  <RegisterCaseCard caseData={caseData} meetingId={currentMeetingId} />
                </div>
              ))}
              {rightPageCases.length < 3 && (
                Array.from({ length: 3 - rightPageCases.length }).map((_, index) => (
                  <div key={`empty-right-${index}`} className="flex-1 min-h-0 border-2 border-dashed rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground text-xs">Empty slot</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Pagination Arrow - Right (Desktop) */}
        {totalPagesDesktop > 1 && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextPage}
            disabled={!hasNextPageDesktop}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-14 z-30 h-12 w-12 rounded-full shadow-lg bg-white border-2 hover:bg-accent hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        )}
      </div>

      {/* Page Indicator - Show for mobile or desktop */}
      {(totalPagesMobile > 1 || totalPagesDesktop > 1) && (
        <div className="flex justify-center mt-4 gap-2">
          {Array.from({ length: Math.max(totalPagesMobile, totalPagesDesktop) }).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentPage(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentPage
                  ? "w-8 bg-primary"
                  : "w-2 bg-muted hover:bg-muted-foreground/50"
              }`}
              aria-label={`Go to page ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

