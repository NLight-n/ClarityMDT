import * as dicomParser from "dicom-parser";

type DicomDataSet = dicomParser.DataSet;

const TAGS = {
  AccessionNumber: "x00080050",
  BitsAllocated: "x00280100",
  BitsStored: "x00280101",
  BodyPartExamined: "x00180015",
  BurnedInAnnotation: "x00280301",
  Columns: "x00280011",
  FrameOfReferenceUID: "x00200052",
  HighBit: "x00280102",
  ImageOrientationPatient: "x00200037",
  ImagePositionPatient: "x00200032",
  ImageType: "x00080008",
  ImagerPixelSpacing: "x00181164",
  InstanceNumber: "x00200013",
  LargestImagePixelValue: "x00280107",
  LossyImageCompression: "x00282110",
  LossyImageCompressionMethod: "x00282114",
  LossyImageCompressionRatio: "x00282112",
  Modality: "x00080060",
  NumberOfFrames: "x00280008",
  PatientID: "x00100020",
  PatientName: "x00100010",
  PatientSex: "x00100040",
  PatientWeight: "x00101030",
  PhotometricInterpretation: "x00280004",
  PixelAspectRatio: "x00280034",
  PixelRepresentation: "x00280103",
  PixelSpacing: "x00280030",
  PlanarConfiguration: "x00280006",
  PresentationLUTShape: "x20500020",
  RescaleIntercept: "x00281052",
  RescaleSlope: "x00281053",
  RescaleType: "x00281054",
  Rows: "x00280010",
  SOPClassUID: "x00080016",
  SOPInstanceUID: "x00080018",
  SamplesPerPixel: "x00280002",
  SeriesDate: "x00080021",
  SeriesDescription: "x0008103e",
  SeriesInstanceUID: "x0020000e",
  SeriesNumber: "x00200011",
  SeriesTime: "x00080031",
  SliceLocation: "x00201041",
  SliceThickness: "x00180050",
  SmallestImagePixelValue: "x00280106",
  SpacingBetweenSlices: "x00180088",
  StudyDate: "x00080020",
  StudyDescription: "x00081030",
  StudyID: "x00200010",
  StudyInstanceUID: "x0020000d",
  StudyTime: "x00080030",
  TransferSyntaxUID: "x00020010",
  VOILUTFunction: "x00281056",
  WindowCenter: "x00281050",
  WindowWidth: "x00281051",
} as const;

function cleanString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function stringValue(dataSet: DicomDataSet, tag: string) {
  return cleanString(dataSet.string(tag));
}

function textValue(dataSet: DicomDataSet, tag: string) {
  return cleanString(dataSet.text(tag) || dataSet.string(tag));
}

function splitStringValue(dataSet: DicomDataSet, tag: string) {
  const value = stringValue(dataSet, tag);
  if (!value) return undefined;
  const values = value.split("\\").map(v => v.trim()).filter(Boolean);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

function intValue(dataSet: DicomDataSet, tag: string) {
  const value = dataSet.intString(tag);
  return value ?? undefined;
}

function decimalValue(dataSet: DicomDataSet, tag: string) {
  const value = dataSet.floatString(tag);
  return value ?? undefined;
}

function decimalListValue(dataSet: DicomDataSet, tag: string) {
  const value = stringValue(dataSet, tag);
  if (!value) return undefined;

  const values = value
    .split("\\")
    .map(v => Number(v.trim()))
    .filter(v => Number.isFinite(v));

  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

function intListValue(dataSet: DicomDataSet, tag: string) {
  const value = stringValue(dataSet, tag);
  if (!value) return undefined;

  const values = value
    .split("\\")
    .map(v => Number.parseInt(v.trim(), 10))
    .filter(v => Number.isFinite(v));

  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

function uint16Value(dataSet: DicomDataSet, tag: string) {
  const value = dataSet.uint16(tag);
  return value ?? undefined;
}

function imagePixelValue(dataSet: DicomDataSet, tag: string) {
  const pixelRepresentation = uint16Value(dataSet, TAGS.PixelRepresentation);
  const value = pixelRepresentation === 1 ? dataSet.int16(tag) : dataSet.uint16(tag);
  return value ?? undefined;
}

function addIfPresent(metadata: Record<string, any>, key: string, value: any) {
  if (value !== undefined && value !== null) {
    metadata[key] = value;
  }
}

function buildOhifMetadata(dataSet: DicomDataSet) {
  const metadata: Record<string, any> = {};

  addIfPresent(metadata, "AccessionNumber", stringValue(dataSet, TAGS.AccessionNumber));
  addIfPresent(metadata, "BitsAllocated", uint16Value(dataSet, TAGS.BitsAllocated));
  addIfPresent(metadata, "BitsStored", uint16Value(dataSet, TAGS.BitsStored));
  addIfPresent(metadata, "BodyPartExamined", stringValue(dataSet, TAGS.BodyPartExamined));
  addIfPresent(metadata, "BurnedInAnnotation", stringValue(dataSet, TAGS.BurnedInAnnotation));
  addIfPresent(metadata, "Columns", uint16Value(dataSet, TAGS.Columns));
  addIfPresent(metadata, "FrameOfReferenceUID", stringValue(dataSet, TAGS.FrameOfReferenceUID));
  addIfPresent(metadata, "HighBit", uint16Value(dataSet, TAGS.HighBit));
  addIfPresent(metadata, "ImageOrientationPatient", decimalListValue(dataSet, TAGS.ImageOrientationPatient));
  addIfPresent(metadata, "ImagePositionPatient", decimalListValue(dataSet, TAGS.ImagePositionPatient));
  addIfPresent(metadata, "ImageType", splitStringValue(dataSet, TAGS.ImageType));
  addIfPresent(metadata, "ImagerPixelSpacing", decimalListValue(dataSet, TAGS.ImagerPixelSpacing));
  addIfPresent(metadata, "InstanceNumber", intValue(dataSet, TAGS.InstanceNumber));
  addIfPresent(metadata, "LargestImagePixelValue", imagePixelValue(dataSet, TAGS.LargestImagePixelValue));
  addIfPresent(metadata, "LossyImageCompression", stringValue(dataSet, TAGS.LossyImageCompression));
  addIfPresent(metadata, "LossyImageCompressionMethod", splitStringValue(dataSet, TAGS.LossyImageCompressionMethod));
  addIfPresent(metadata, "LossyImageCompressionRatio", decimalListValue(dataSet, TAGS.LossyImageCompressionRatio));
  addIfPresent(metadata, "Modality", stringValue(dataSet, TAGS.Modality));
  addIfPresent(metadata, "NumberOfFrames", intValue(dataSet, TAGS.NumberOfFrames));
  addIfPresent(metadata, "PatientID", stringValue(dataSet, TAGS.PatientID));
  addIfPresent(metadata, "PatientName", stringValue(dataSet, TAGS.PatientName));
  addIfPresent(metadata, "PatientSex", stringValue(dataSet, TAGS.PatientSex));
  addIfPresent(metadata, "PatientWeight", decimalValue(dataSet, TAGS.PatientWeight));
  addIfPresent(metadata, "PhotometricInterpretation", stringValue(dataSet, TAGS.PhotometricInterpretation));
  addIfPresent(metadata, "PixelAspectRatio", intListValue(dataSet, TAGS.PixelAspectRatio));
  addIfPresent(metadata, "PixelRepresentation", uint16Value(dataSet, TAGS.PixelRepresentation));
  addIfPresent(metadata, "PixelSpacing", decimalListValue(dataSet, TAGS.PixelSpacing));
  addIfPresent(metadata, "PlanarConfiguration", uint16Value(dataSet, TAGS.PlanarConfiguration));
  addIfPresent(metadata, "PresentationLUTShape", stringValue(dataSet, TAGS.PresentationLUTShape));
  addIfPresent(metadata, "RescaleIntercept", decimalValue(dataSet, TAGS.RescaleIntercept));
  addIfPresent(metadata, "RescaleSlope", decimalValue(dataSet, TAGS.RescaleSlope));
  addIfPresent(metadata, "RescaleType", stringValue(dataSet, TAGS.RescaleType));
  addIfPresent(metadata, "Rows", uint16Value(dataSet, TAGS.Rows));
  addIfPresent(metadata, "SOPClassUID", stringValue(dataSet, TAGS.SOPClassUID));
  addIfPresent(metadata, "SOPInstanceUID", stringValue(dataSet, TAGS.SOPInstanceUID));
  addIfPresent(metadata, "SamplesPerPixel", uint16Value(dataSet, TAGS.SamplesPerPixel));
  addIfPresent(metadata, "SeriesDate", stringValue(dataSet, TAGS.SeriesDate));
  addIfPresent(metadata, "SeriesDescription", textValue(dataSet, TAGS.SeriesDescription));
  addIfPresent(metadata, "SeriesInstanceUID", stringValue(dataSet, TAGS.SeriesInstanceUID));
  addIfPresent(metadata, "SeriesNumber", intValue(dataSet, TAGS.SeriesNumber));
  addIfPresent(metadata, "SeriesTime", stringValue(dataSet, TAGS.SeriesTime));
  addIfPresent(metadata, "SliceLocation", decimalValue(dataSet, TAGS.SliceLocation));
  addIfPresent(metadata, "SliceThickness", decimalValue(dataSet, TAGS.SliceThickness));
  addIfPresent(metadata, "SmallestImagePixelValue", imagePixelValue(dataSet, TAGS.SmallestImagePixelValue));
  addIfPresent(metadata, "SpacingBetweenSlices", decimalValue(dataSet, TAGS.SpacingBetweenSlices));
  addIfPresent(metadata, "StudyDate", stringValue(dataSet, TAGS.StudyDate));
  addIfPresent(metadata, "StudyDescription", textValue(dataSet, TAGS.StudyDescription));
  addIfPresent(metadata, "StudyID", stringValue(dataSet, TAGS.StudyID));
  addIfPresent(metadata, "StudyInstanceUID", stringValue(dataSet, TAGS.StudyInstanceUID));
  addIfPresent(metadata, "StudyTime", stringValue(dataSet, TAGS.StudyTime));
  addIfPresent(metadata, "TransferSyntaxUID", stringValue(dataSet, TAGS.TransferSyntaxUID));
  addIfPresent(metadata, "VOILUTFunction", stringValue(dataSet, TAGS.VOILUTFunction));
  addIfPresent(metadata, "WindowCenter", decimalListValue(dataSet, TAGS.WindowCenter));
  addIfPresent(metadata, "WindowWidth", decimalListValue(dataSet, TAGS.WindowWidth));

  return metadata;
}

function parseDicomMetadata(arrayBuffer: ArrayBuffer) {
  const byteArray = new Uint8Array(arrayBuffer);
  const dataSet = dicomParser.parseDicom(byteArray, { untilTag: "x7fe00010" });
  return buildOhifMetadata(dataSet);
}

function getDisplayPatientName(patientName: any) {
  return typeof patientName === "string" && patientName.trim() ? patientName : "Unknown";
}

export async function parseDicomFiles(files: File[]) {
  const result: any = {
    studies: []
  };

  const studyMap = new Map<string, any>();

  for (const file of files) {
    if (file.name.startsWith(".")) continue; // Skip hidden files

    try {
      const arrayBuffer = await file.arrayBuffer();
      const metadata = parseDicomMetadata(arrayBuffer);

      // Extract key hierarchy UIDs
      const studyInstanceUID = metadata.StudyInstanceUID;
      const seriesInstanceUID = metadata.SeriesInstanceUID;
      const sopInstanceUID = metadata.SOPInstanceUID;

      if (!studyInstanceUID || !seriesInstanceUID || !sopInstanceUID) {
        continue;
      }

      // Group into Studies
      if (!studyMap.has(studyInstanceUID)) {
        studyMap.set(studyInstanceUID, {
          StudyInstanceUID: studyInstanceUID,
          StudyDescription: metadata.StudyDescription || "No Description",
          StudyDate: metadata.StudyDate || "",
          PatientName: getDisplayPatientName(metadata.PatientName),
          PatientID: metadata.PatientID || "Unknown",
          NumInstances: 0,
          series: [],
          _seriesMap: new Map<string, any>()
        });
      }

      const study = studyMap.get(studyInstanceUID);
      study.NumInstances += 1;

      // Group into Series
      if (!study._seriesMap.has(seriesInstanceUID)) {
        study._seriesMap.set(seriesInstanceUID, {
          SeriesInstanceUID: seriesInstanceUID,
          SeriesDescription: metadata.SeriesDescription || "",
          SeriesNumber: metadata.SeriesNumber !== undefined ? metadata.SeriesNumber : 1,
          Modality: metadata.Modality || "UNKNOWN",
          instances: []
        });
        study.series.push(study._seriesMap.get(seriesInstanceUID));
      }

      const series = study._seriesMap.get(seriesInstanceUID);

      // Add instance
      series.instances.push({
        metadata,
        // We will assign a temporary placeholder URL, which we will later replace dynamically
        url: `dicomweb:blob://${file.name}`,
        file: file // Hang onto the original File object for uploading
      });

    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`Skipping DICOM file ${file.name}: ${message}`);
    }
  }

  // Finalize the manifest structure
  for (const study of studyMap.values()) {
    delete study._seriesMap;
    result.studies.push(study);
  }

  return result;
}
