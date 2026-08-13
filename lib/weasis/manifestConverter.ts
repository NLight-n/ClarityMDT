/**
 * Utility to convert DICOM manifest JSON into Weasis XML format.
 */

export interface DicomInstance {
  url?: string; // Storage key or path in MinIO
  metadata?: {
    SOPInstanceUID?: string;
    SOPClassUID?: string;
    InstanceNumber?: number | string;
    SeriesInstanceUID?: string;
    SeriesDescription?: string;
    SeriesNumber?: number | string;
    Modality?: string;
    StudyInstanceUID?: string;
    PatientID?: string;
    PatientName?: string;
    [key: string]: any;
  };
  SOPInstanceUID?: string;
  InstanceNumber?: number | string;
  [key: string]: any;
}

export interface DicomSeries {
  SeriesInstanceUID: string;
  SeriesDescription?: string;
  SeriesNumber?: number | string;
  Modality?: string;
  instances?: DicomInstance[];
  [key: string]: any;
}

export interface DicomStudy {
  StudyInstanceUID: string;
  StudyDescription?: string;
  StudyDate?: string;
  StudyTime?: string;
  AccessionNumber?: string;
  PatientID?: string;
  PatientName?: string;
  series?: DicomSeries[];
  [key: string]: any;
}

export interface DicomManifestJson {
  studies?: DicomStudy[];
  [key: string]: any;
}

/**
 * Safely escape string for XML attribute/text content
 */
export function escapeXml(val: string | number | undefined | null): string {
  if (val == null) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Encode a MinIO storage key into a URL-safe file ID for the file download route
 */
export function encodeFileId(storageKey: string): string {
  return Buffer.from(storageKey, "utf8").toString("base64url");
}

/**
 * Decode a file ID back into a MinIO storage key
 */
export function decodeFileId(fileId: string): string {
  return Buffer.from(fileId, "base64url").toString("utf8");
}

/**
 * Extract all storage keys from a DICOM manifest JSON (including MPR derived series)
 */
export function extractManifestStorageKeys(manifestJson: DicomManifestJson): Set<string> {
  const keys = new Set<string>();
  if (manifestJson?.studies && Array.isArray(manifestJson.studies)) {
    for (const study of manifestJson.studies) {
      if (study.series && Array.isArray(study.series)) {
        for (const series of study.series) {
          if (series.instances && Array.isArray(series.instances)) {
            for (const instance of series.instances) {
              if (instance.url) {
                keys.add(instance.url);
              }
            }
          }
        }
      }
    }
  }
  return keys;
}

/**
 * Convert DICOM manifest JSON into Weasis XML manifest format.
 *
 * @param manifestJson The manifest JSON structure
 * @param token The short-lived Weasis access token
 * @param publicOrigin Public application origin (e.g., https://mdt.hospital.org)
 * @returns XML string conforming to Weasis XML manifest schema
 */
export function convertToWeasisXml(
  manifestJson: DicomManifestJson,
  token: string,
  publicOrigin: string
): string {
  const studies = manifestJson?.studies || [];

  const baseUrl = `${publicOrigin.replace(/\/+$/, "")}/api/weasis/file/${token}/`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<wado_query xmlns="http://www.weasis.org/xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" wadoURL="${escapeXml(baseUrl)}" requireOnlyModel="false">\n`;

  for (const study of studies) {
    // Attempt to resolve Patient info from study or first instance metadata
    const firstInstanceMeta = study.series?.[0]?.instances?.[0]?.metadata;
    const patientID = study.PatientID || firstInstanceMeta?.PatientID || "ANONYMOUS";
    const patientName = study.PatientName || firstInstanceMeta?.PatientName || "";
    const studyInstanceUID = study.StudyInstanceUID || firstInstanceMeta?.StudyInstanceUID || "";
    const studyDescription = study.StudyDescription || firstInstanceMeta?.StudyDescription || "";
    const studyDate = study.StudyDate || firstInstanceMeta?.StudyDate || "";
    const studyTime = study.StudyTime || firstInstanceMeta?.StudyTime || "";
    const accessionNumber = study.AccessionNumber || firstInstanceMeta?.AccessionNumber || "";

    xml += `  <Patient PatientID="${escapeXml(patientID)}" PatientName="${escapeXml(patientName)}">\n`;
    xml += `    <Study StudyInstanceUID="${escapeXml(studyInstanceUID)}" StudyDescription="${escapeXml(studyDescription)}" StudyDate="${escapeXml(studyDate)}" StudyTime="${escapeXml(studyTime)}" AccessionNumber="${escapeXml(accessionNumber)}">\n`;

    const seriesList = study.series || [];
    for (const series of seriesList) {
      const seriesUID = series.SeriesInstanceUID || "";
      const seriesDesc = series.SeriesDescription || "";
      const seriesNum = series.SeriesNumber != null ? String(series.SeriesNumber) : "1";
      const modality = series.Modality || "OT";

      xml += `      <Series SeriesInstanceUID="${escapeXml(seriesUID)}" SeriesDescription="${escapeXml(seriesDesc)}" SeriesNumber="${escapeXml(seriesNum)}" Modality="${escapeXml(modality)}">\n`;

      const instances = series.instances || [];
      for (const instance of instances) {
        const sopInstanceUID = instance.metadata?.SOPInstanceUID || instance.SOPInstanceUID || "";
        const instanceNum = instance.metadata?.InstanceNumber != null 
          ? String(instance.metadata.InstanceNumber) 
          : instance.InstanceNumber != null 
          ? String(instance.InstanceNumber) 
          : "1";
        const sopClassUID = instance.metadata?.SOPClassUID || "";
        const storageKey = instance.url || "";

        if (!storageKey) continue;

        const fileId = encodeFileId(storageKey);
        const fileDownloadUrl = `${baseUrl}${fileId}`;

        xml += `        <Instance SOPInstanceUID="${escapeXml(sopInstanceUID)}" InstanceNumber="${escapeXml(instanceNum)}" DirectDownloadFile="${escapeXml(fileId)}" DirectDownloadFileUrl="${escapeXml(fileDownloadUrl)}"`;
        if (sopClassUID) {
          xml += ` SOPClassUID="${escapeXml(sopClassUID)}"`;
        }
        xml += ` />\n`;
      }

      xml += `      </Series>\n`;
    }

    xml += `    </Study>\n`;
    xml += `  </Patient>\n`;
  }

  xml += `</wado_query>\n`;
  return xml;
}
