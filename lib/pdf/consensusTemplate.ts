import { PDFDocument, PDFFont, rgb, StandardFonts } from "pdf-lib";
import { stripInlineImages } from "./utils";

// Using pdf-lib instead of PDFKit for better Next.js serverless compatibility
// pdf-lib doesn't require external font files

interface CaseData {
  id: string;
  patientName: string;
  mrn: string | null;
  age: number;
  gender: string;
  presentingDepartment: {
    name: string;
  };
  clinicalDetails: string;
  radiologyFindings: any;
  pathologyFindings: any;
  diagnosisStage: string;
  treatmentPlan: string;
  question: string;
  consensusReport: {
    finalDiagnosis: string;
    mdtConsensus: string;
    meetingDate: string;
    remarks: string | null;
    createdBy: {
      name: string;
    };
  };
  specialistsOpinions: Array<{
    opinionText: string;
    consultant: {
      name: string;
    };
    department: {
      name: string;
    };
  }>;
}

/**
 * Generate a consensus report PDF
 * Returns a PDF buffer
 * @param caseData - Case data with all related information
 * @param selectedSections - Array of section names to include in the PDF
 */
interface HospitalSettings {
  name: string | null;
  logoUrl: string | null;
}

interface AttendeeSignature {
  userId: string;
  name: string;
  role: string;
  department: string | null;
  signatureUrl: string | null;
  signatureImage?: Uint8Array; // Image bytes for embedding
}

interface RichTextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export async function generateConsensusPDF(
  caseData: CaseData,
  selectedSections: string[] = [
    "patientDetails",
    "clinicalDetails",
    "finalDiagnosis",
    "consensusReport",
  ],
  hospitalSettings?: HospitalSettings | null,
  selectedAttendees?: AttendeeSignature[]
): Promise<Buffer> {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size in points
    const { width, height } = page.getSize();

    // Load fonts
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaObliqueFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
    const helveticaBoldObliqueFont = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

    // Helper function to check if a section should be included
    const includeSection = (sectionName: string) => selectedSections.includes(sectionName);

    // Constants for layout
    const margin = 50;
    const maxWidth = width - 2 * margin;
    let yPosition = height - margin;
    let currentPage = page;

    // Helper function to add text with word wrap
    const addText = (
      text: string | any,
      fontSize: number,
      bold: boolean = false,
      indent: number = 0,
      spacing: number = 12
    ) => {
      // Convert to string if needed (handle ProseMirror JSON, null, undefined, etc.)
      let textStr: string;
      if (text == null || text === undefined) {
        textStr = "";
      } else if (typeof text === "string") {
        textStr = text;
      } else if (typeof text === "object") {
        // If it's an object, try to extract text using stripInlineImages
        textStr = stripInlineImages(text);
      } else {
        textStr = String(text);
      }
      
      const font = bold ? helveticaBoldFont : helveticaFont;
      const lines = textStr.split("\n");
      
      for (const line of lines) {
        if (yPosition < margin + 50) {
          // Add new page if needed
          currentPage = pdfDoc.addPage([595, 842]);
          yPosition = height - margin;
        }

        const words = line.split(" ");
        let currentLine = "";
        let lineStart = true;

        for (const word of words) {
          const testLine = lineStart ? currentLine + word : currentLine + " " + word;
          const textWidth = font.widthOfTextAtSize(testLine, fontSize);

          if (textWidth > maxWidth - indent && currentLine !== "") {
            // Draw current line
            currentPage.drawText(currentLine, {
              x: margin + indent,
              y: yPosition,
              size: fontSize,
              font: font,
            });
            yPosition -= spacing;
            currentLine = word;
            lineStart = true;

            if (yPosition < margin + 50) {
              currentPage = pdfDoc.addPage([595, 842]);
              yPosition = height - margin;
            }
          } else {
            currentLine = testLine;
            lineStart = false;
          }
        }

        if (currentLine) {
          currentPage.drawText(currentLine, {
            x: margin + indent,
            y: yPosition,
            size: fontSize,
            font: font,
          });
          yPosition -= spacing;
        }

        // Add line break after each paragraph line
        yPosition -= 2;
      }
      return yPosition;
    };

    const getFontForSegment = (segment: RichTextSegment): PDFFont => {
      if (segment.bold && segment.italic) return helveticaBoldObliqueFont;
      if (segment.bold) return helveticaBoldFont;
      if (segment.italic) return helveticaObliqueFont;
      return helveticaFont;
    };

    const ensureTextSpace = (spacing: number) => {
      if (yPosition < margin + 50) {
        currentPage = pdfDoc.addPage([595, 842]);
        yPosition = height - margin;
      }
    };

    const parseRichContent = (content: any) => {
      if (!content) return null;
      if (typeof content === "string") {
        try {
          const parsed = JSON.parse(content);
          return parsed?.type === "doc" ? parsed : null;
        } catch {
          return null;
        }
      }
      return typeof content === "object" && content.type === "doc" ? content : null;
    };

    const getPlainText = (content: any): string => {
      if (!content) return "";
      if (typeof content === "string") {
        const richDoc = parseRichContent(content);
        return richDoc ? stripInlineImages(richDoc) : content;
      }
      return stripInlineImages(content);
    };

    const flattenInlineSegments = (
      node: any,
      inherited: Omit<RichTextSegment, "text"> = {}
    ): RichTextSegment[] => {
      if (!node) return [];
      if (node.type === "image") return [];
      if (node.type === "hardBreak") return [{ text: "\n", ...inherited }];

      const marks = Array.isArray(node.marks) ? node.marks : [];
      const segmentStyle = {
        ...inherited,
        bold: inherited.bold || marks.some((mark: any) => mark.type === "bold"),
        italic: inherited.italic || marks.some((mark: any) => mark.type === "italic"),
      };

      if (typeof node.text === "string") {
        return [{ text: node.text, ...segmentStyle }];
      }

      if (Array.isArray(node.content)) {
        return node.content.flatMap((child: any) => flattenInlineSegments(child, segmentStyle));
      }

      return [];
    };

    const tokenizeSegments = (segments: RichTextSegment[]): RichTextSegment[] =>
      segments.flatMap((segment) =>
        segment.text
          .split(/(\n|\s+)/)
          .filter((text) => text.length > 0)
          .map((text) => ({ ...segment, text }))
      );

    const drawSegmentLine = (
      line: RichTextSegment[],
      x: number,
      y: number,
      fontSize: number
    ) => {
      let cursorX = x;
      for (const segment of line) {
        if (!segment.text) continue;
        const font = getFontForSegment(segment);
        currentPage.drawText(segment.text, {
          x: cursorX,
          y,
          size: fontSize,
          font,
        });
        cursorX += font.widthOfTextAtSize(segment.text, fontSize);
      }
    };

    const addRichInline = (
      segments: RichTextSegment[],
      fontSize: number,
      indent: number = 0,
      spacing: number = 12,
      prefix?: RichTextSegment[]
    ) => {
      const x = margin + indent;
      const lineWidth = maxWidth - indent;
      const tokens = tokenizeSegments([...(prefix || []), ...segments]);
      let currentLine: RichTextSegment[] = [];
      let currentWidth = 0;

      const flushLine = () => {
        ensureTextSpace(spacing);
        const trimmed = [...currentLine];
        while (trimmed.length > 0 && /^\s+$/.test(trimmed[trimmed.length - 1].text)) {
          trimmed.pop();
        }
        if (trimmed.length > 0) {
          drawSegmentLine(trimmed, x, yPosition, fontSize);
        }
        yPosition -= spacing;
        currentLine = [];
        currentWidth = 0;
      };

      for (const token of tokens) {
        if (token.text === "\n") {
          flushLine();
          continue;
        }

        const font = getFontForSegment(token);
        const tokenWidth = font.widthOfTextAtSize(token.text, fontSize);
        const isWhitespace = /^\s+$/.test(token.text);

        if (currentWidth + tokenWidth > lineWidth && currentLine.length > 0 && !isWhitespace) {
          flushLine();
        }

        if (currentLine.length === 0 && isWhitespace) continue;

        currentLine.push(token);
        currentWidth += tokenWidth;
      }

      if (currentLine.length > 0) {
        flushLine();
      }

      yPosition -= 2;
      return yPosition;
    };

    const renderRichNode = (
      node: any,
      indent: number = 20,
      listContext?: { type: "bulletList" | "orderedList"; index: number }
    ) => {
      if (!node) return;

      if (node.type === "paragraph") {
        const segments = flattenInlineSegments(node);
        const prefix = listContext
          ? [{
              text: listContext.type === "orderedList" ? `${listContext.index}. ` : "\u2022 ",
              bold: false,
            }]
          : undefined;
        addRichInline(segments, 11, indent, 12, prefix);
        return;
      }

      if (node.type === "heading") {
        const level = node.attrs?.level || 2;
        const fontSize = level === 1 ? 14 : level === 2 ? 13 : 12;
        const segments = flattenInlineSegments(node).map((segment) => ({ ...segment, bold: true }));
        addRichInline(segments, fontSize, indent, fontSize + 2);
        yPosition -= 4;
        return;
      }

      if (node.type === "bulletList" || node.type === "orderedList") {
        let itemIndex = node.attrs?.start || 1;
        for (const item of node.content || []) {
          renderRichNode(item, indent, { type: node.type, index: itemIndex });
          itemIndex += 1;
        }
        yPosition -= 4;
        return;
      }

      if (node.type === "listItem") {
        const children = node.content || [];
        let renderedFirstParagraph = false;
        for (const child of children) {
          if (!renderedFirstParagraph && child.type === "paragraph") {
            renderRichNode(child, indent, listContext);
            renderedFirstParagraph = true;
          } else {
            renderRichNode(child, indent + 18);
          }
        }
        return;
      }

      if (Array.isArray(node.content)) {
        for (const child of node.content) {
          renderRichNode(child, indent);
        }
      }
    };

    const addRichText = (content: any, indent: number = 20) => {
      const richDoc = parseRichContent(content);
      if (!richDoc) {
        const plainText = getPlainText(content);
        if (plainText.trim()) addText(plainText, 11, false, indent, 12);
        return yPosition;
      }

      for (const child of richDoc.content || []) {
        renderRichNode(child, indent);
      }
      return yPosition;
    };

    // Header - Hospital logo/name or blank space
    const includeHospitalHeader = selectedSections.includes("hospitalHeader");
    if (includeHospitalHeader && hospitalSettings) {
      let headerHeight = 0;
      
      // Add hospital logo if available
      if (hospitalSettings.logoUrl) {
        try {
          // Fetch and embed the image
          const imageResponse = await fetch(hospitalSettings.logoUrl);
          if (imageResponse.ok) {
            const imageBytes = await imageResponse.arrayBuffer();
            let image = null;
            // Try PNG first, then JPG
            try {
              image = await pdfDoc.embedPng(imageBytes);
            } catch (pngError) {
              try {
                image = await pdfDoc.embedJpg(imageBytes);
              } catch (jpgError) {
                console.error("Error embedding image (tried PNG and JPG):", pngError, jpgError);
              }
            }
            
            if (image) {
              const imageDims = image.scale(0.15); // Scale down to fit (max height ~100px)
              const logoX = (width - imageDims.width) / 2; // Center horizontally
              const logoY = yPosition - imageDims.height;
              currentPage.drawImage(image, {
                x: logoX,
                y: logoY,
                width: imageDims.width,
                height: imageDims.height,
              });
              headerHeight = imageDims.height + 10;
            }
          }
        } catch (error) {
          console.error("Error loading hospital logo:", error);
        }
      }
      
      // Add hospital name if available (below logo or standalone)
      if (hospitalSettings.name) {
        const nameY = headerHeight > 0 ? yPosition - headerHeight - 10 : yPosition - 10;
        const nameWidth = helveticaBoldFont.widthOfTextAtSize(hospitalSettings.name, 16);
        currentPage.drawText(hospitalSettings.name, {
          x: (width - nameWidth) / 2,
          y: nameY,
          size: 16,
          font: helveticaBoldFont,
          color: rgb(0, 0, 0),
        });
        headerHeight += headerHeight > 0 ? 25 : 20; // Add height for name
      }
      
      yPosition -= headerHeight > 0 ? headerHeight + 20 : 60; // Add spacing after header
    } else {
      // Leave blank space for hospital letterhead (about 60 points)
      yPosition -= 60;
    }

    // Center the title
    const titleText = "Multi-Disciplinary Team Consensus Report";
    const titleWidth = helveticaFont.widthOfTextAtSize(titleText, 16);
    currentPage.drawText(titleText, {
      x: (width - titleWidth) / 2,
      y: yPosition,
      size: 16,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    yPosition -= 40;

    // Patient Details Section
    if (includeSection("patientDetails")) {
      const titleY = yPosition;
      yPosition = addText("Patient Details", 14, true, 0, 14);
      // Draw underline
      currentPage.drawLine({
        start: { x: margin, y: titleY - 14 },
        end: { x: width - margin, y: titleY - 14 },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      yPosition -= 10;

      yPosition = addText(`Patient Name: ${caseData.patientName}`, 11, false, 20, 12);
      yPosition = addText(`MRN: ${caseData.mrn || "N/A"}`, 11, false, 20, 12);
      yPosition = addText(`Age: ${caseData.age} years`, 11, false, 20, 12);
      yPosition = addText(`Gender: ${caseData.gender}`, 11, false, 20, 12);
      yPosition = addText(
        `Presenting Department: ${caseData.presentingDepartment.name}`,
        11,
        false,
        20,
        12
      );
      yPosition -= 20;
    }

    // Final Diagnosis Section
    if (includeSection("finalDiagnosis") && caseData.consensusReport?.finalDiagnosis) {
      const finalDiagnosisText = getPlainText(caseData.consensusReport.finalDiagnosis);
      if (finalDiagnosisText) {
        const titleY = yPosition;
        yPosition = addText("Final Diagnosis", 14, true, 0, 14);
        currentPage.drawLine({
          start: { x: margin, y: titleY - 14 },
          end: { x: width - margin, y: titleY - 14 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        yPosition -= 10;

        yPosition = addRichText(caseData.consensusReport.finalDiagnosis, 20);
        yPosition -= 20;
      }
    }

    // Diagnosis Stage
    if (includeSection("diagnosisStage") && caseData.diagnosisStage && !caseData.consensusReport?.finalDiagnosis) {
      const diagnosisText = getPlainText(caseData.diagnosisStage);
      if (diagnosisText) {
        const titleY = yPosition;
        yPosition = addText("Diagnosis Stage", 14, true, 0, 14);
        currentPage.drawLine({
          start: { x: margin, y: titleY - 14 },
          end: { x: width - margin, y: titleY - 14 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        yPosition -= 10;

        yPosition = addRichText(caseData.diagnosisStage, 20);
        yPosition -= 20;
      }
    }

    // Clinical Details
    if (includeSection("clinicalDetails") && caseData.clinicalDetails) {
      const clinicalText = getPlainText(caseData.clinicalDetails);
      if (clinicalText) {
        const titleY = yPosition;
        yPosition = addText("Clinical Details", 14, true, 0, 14);
        currentPage.drawLine({
          start: { x: margin, y: titleY - 14 },
          end: { x: width - margin, y: titleY - 14 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        yPosition -= 10;

        yPosition = addRichText(caseData.clinicalDetails, 20);
        yPosition -= 20;
      }
    }

    // Radiology Findings
    if (includeSection("radiologyFindings")) {
      const radiologyText = getPlainText(caseData.radiologyFindings);
      if (radiologyText) {
        const titleY = yPosition;
        yPosition = addText("Radiology Findings", 14, true, 0, 14);
        currentPage.drawLine({
          start: { x: margin, y: titleY - 14 },
          end: { x: width - margin, y: titleY - 14 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        yPosition -= 10;

        yPosition = addRichText(caseData.radiologyFindings, 20);
        yPosition -= 20;
      }
    }

    // Pathology Findings
    if (includeSection("pathologyFindings")) {
      const pathologyText = getPlainText(caseData.pathologyFindings);
      if (pathologyText) {
        const titleY = yPosition;
        yPosition = addText("Pathology Findings", 14, true, 0, 14);
        currentPage.drawLine({
          start: { x: margin, y: titleY - 14 },
          end: { x: width - margin, y: titleY - 14 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        yPosition -= 10;

        yPosition = addRichText(caseData.pathologyFindings, 20);
        yPosition -= 20;
      }
    }

    // Treatment Plan
    if (includeSection("treatmentPlan") && caseData.treatmentPlan) {
      const treatmentText = getPlainText(caseData.treatmentPlan);
      if (treatmentText) {
        const titleY = yPosition;
        yPosition = addText("Treatment Plan", 14, true, 0, 14);
        currentPage.drawLine({
          start: { x: margin, y: titleY - 14 },
          end: { x: width - margin, y: titleY - 14 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        yPosition -= 10;

        yPosition = addRichText(caseData.treatmentPlan, 20);
        yPosition -= 20;
      }
    }

    // Specialists' Opinions
    if (includeSection("specialistsOpinions") && caseData.specialistsOpinions && caseData.specialistsOpinions.length > 0) {
      const titleY = yPosition;
      yPosition = addText("Specialists' Opinions", 14, true, 0, 14);
      currentPage.drawLine({
        start: { x: margin, y: titleY - 14 },
        end: { x: width - margin, y: titleY - 14 },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      yPosition -= 10;

      caseData.specialistsOpinions.forEach((opinion) => {
        const headerText = `${opinion.department.name} - ${opinion.consultant.name}`;
        yPosition = addText(headerText, 11, false, 20, 12);
        const opinionText = getPlainText(opinion.opinionText);
        if (opinionText) {
          yPosition = addRichText(opinion.opinionText, 40);
          yPosition -= 10;
        }
      });
    }

    // Discussion Question
    if (includeSection("question") && caseData.question) {
      const questionText = getPlainText(caseData.question);
      if (questionText) {
        const titleY = yPosition;
        yPosition = addText("Discussion Question", 14, true, 0, 14);
        currentPage.drawLine({
          start: { x: margin, y: titleY - 14 },
          end: { x: width - margin, y: titleY - 14 },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        yPosition -= 10;

        yPosition = addRichText(caseData.question, 20);
        yPosition -= 20;
      }
    }

    // Consensus Report
    if (includeSection("consensusReport") && caseData.consensusReport) {
      const consensus = caseData.consensusReport;

      const titleY = yPosition;
      yPosition = addText("MDT Consensus", 14, true, 0, 14);
      currentPage.drawLine({
        start: { x: margin, y: titleY - 14 },
        end: { x: width - margin, y: titleY - 14 },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      yPosition -= 10;

      const mdtConsensusText = getPlainText(consensus.mdtConsensus);
      if (mdtConsensusText) {
        yPosition = addRichText(consensus.mdtConsensus, 20);
        yPosition -= 20;
      }

      // Meeting Date
      if (consensus.meetingDate) {
        const meetingDate = new Date(consensus.meetingDate);
        const dateStr = meetingDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        yPosition = addText(`Meeting Date: ${dateStr}`, 11, false, 20, 12);
        yPosition -= 20;
      }

      // Remarks
      if (consensus.remarks) {
        const remarksText = getPlainText(consensus.remarks);
        if (remarksText) {
          yPosition = addText("Remarks:", 11, false, 20, 12);
          yPosition = addRichText(consensus.remarks, 40);
          yPosition -= 20;
        }
      }
    }

    const drawFooter = (pageToDraw: typeof currentPage) => {
      const footerText = "ClarityMDT";
      const footerTextWidth = helveticaFont.widthOfTextAtSize(footerText, 10);
      pageToDraw.drawText(footerText, {
        x: (width - footerTextWidth) / 2,
        y: 30,
        size: 10,
        font: helveticaFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    };

    const footerReserveY = 55;
    const signatureTopGap = 20;

    // Signature section - render attendee signatures after content, never over it.
    if (selectedAttendees && selectedAttendees.length > 0) {
      // Calculate signature dimensions for compact layout
      // Increase height if there are coordinators (they need extra line for "MDT Co-ordinator")
      const hasCoordinators = selectedAttendees.some(a => a.role === "Coordinator" || a.role === "Admin");
      const signatureHeight = hasCoordinators ? 60 : 50; // Height for signature image + name + dept (+ coordinator label) - increased to accommodate larger signatures
      const signatureSpacing = 5; // Space between signatures
      const signatureRowGap = 10;
      const availableWidth = width - 2 * margin;
      const maxSignaturesPerRow = Math.min(selectedAttendees.length, 6); // Max 6 per row
      const signatureWidth = (availableWidth - (maxSignaturesPerRow - 1) * signatureSpacing) / maxSignaturesPerRow;
      const imageHeight = 35; // Height for signature image/blank space (increased from 20)
      const imageWidth = signatureWidth - 10; // Leave some padding
      
      let currentX = margin;
      let currentY = yPosition - signatureTopGap;
      let signaturesInCurrentRow = 0;

      const ensureSignatureRowSpace = () => {
        if (currentY - signatureHeight < footerReserveY) {
          currentPage = pdfDoc.addPage([595, 842]);
          currentY = height - margin;
          currentX = margin;
          signaturesInCurrentRow = 0;
        }
      };

      ensureSignatureRowSpace();
      
      for (const attendee of selectedAttendees) {
        if (signaturesInCurrentRow >= maxSignaturesPerRow) {
          // Move to next row
          currentX = margin;
          currentY -= signatureHeight + signatureRowGap;
          signaturesInCurrentRow = 0;
          ensureSignatureRowSpace();
        }
        
        try {
          const hasSignature = attendee.signatureUrl && attendee.signatureImage;
          const imageY = currentY - imageHeight;
          
          if (hasSignature) {
            // Embed and draw the signature image
            let signatureImage;
            try {
              signatureImage = await pdfDoc.embedPng(attendee.signatureImage!);
            } catch (pngError) {
              try {
                signatureImage = await pdfDoc.embedJpg(attendee.signatureImage!);
              } catch (jpgError) {
                console.error(`Error embedding signature for ${attendee.name}:`, pngError, jpgError);
                // Fall through to blank space if image can't be embedded
              }
            }
            
            if (signatureImage) {
              // Scale image to fit
              const imageDims = signatureImage.scaleToFit(imageWidth, imageHeight);
              const imageX = currentX + (signatureWidth - imageDims.width) / 2;
              
              // Draw signature image
              currentPage.drawImage(signatureImage, {
                x: imageX,
                y: imageY,
                width: imageDims.width,
                height: imageDims.height,
              });
            }
          }
          
          // Draw blank space rectangle if no signature (for physical signature)
          if (!hasSignature) {
            const blankSpaceX = currentX + (signatureWidth - imageWidth) / 2;
            currentPage.drawRectangle({
              x: blankSpaceX,
              y: imageY,
              width: imageWidth,
              height: imageHeight,
              borderColor: rgb(0, 0, 0),
              borderWidth: 0.5,
            });
          }
          
          // Draw name below signature/blank space
          const nameY = imageY - 8;
          const nameText = attendee.name;
          const nameWidth = helveticaFont.widthOfTextAtSize(nameText, 8);
          currentPage.drawText(nameText, {
            x: currentX + (signatureWidth - nameWidth) / 2,
            y: nameY,
            size: 8,
            font: helveticaFont,
          });
          
          // Draw department if available
          let currentTextY = nameY - 10;
          if (attendee.department) {
            const deptText = attendee.department;
            const deptWidth = helveticaFont.widthOfTextAtSize(deptText, 7);
            currentPage.drawText(deptText, {
              x: currentX + (signatureWidth - deptWidth) / 2,
              y: currentTextY,
              size: 7,
              font: helveticaFont,
              color: rgb(0.5, 0.5, 0.5),
            });
            currentTextY -= 9; // Move down for next line if coordinator
          }
          
          // Draw "MDT Co-ordinator" if the attendee is a Coordinator or Admin
          if (attendee.role === "Coordinator" || attendee.role === "Admin") {
            const coordinatorText = "MDT Co-ordinator";
            const coordinatorWidth = helveticaFont.widthOfTextAtSize(coordinatorText, 7);
            currentPage.drawText(coordinatorText, {
              x: currentX + (signatureWidth - coordinatorWidth) / 2,
              y: currentTextY,
              size: 7,
              font: helveticaFont,
              color: rgb(0.5, 0.5, 0.5),
            });
          }
        } catch (error) {
          console.error(`Error rendering signature for ${attendee.name}:`, error);
          // Continue with next signature
        }
        
        currentX += signatureWidth + signatureSpacing;
        signaturesInCurrentRow++;
      }
    } else {
      // Fallback: Show MDT Coordinator Signature if no attendees selected
      let signatureY = yPosition - signatureTopGap;
      if (signatureY - 50 < footerReserveY) {
        currentPage = pdfDoc.addPage([595, 842]);
        signatureY = height - margin;
      }

      currentPage.drawText("MDT Coordinator Signature", {
        x: width - margin - 150,
        y: signatureY - 20,
        size: 10,
        font: helveticaFont,
      });
      currentPage.drawLine({
        start: { x: width - margin - 200, y: signatureY - 35 },
        end: { x: width - margin, y: signatureY - 35 },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
    }

    const pages = pdfDoc.getPages();
    drawFooter(pages[pages.length - 1]);

    // Serialize the PDF to bytes
    const pdfBytes = await pdfDoc.save();

    // Convert to Buffer
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}
