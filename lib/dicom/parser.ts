import * as dcmjs from "dcmjs";

export async function parseDicomFiles(files: File[]) {
  const result: any = {
    studies: []
  };

  const studyMap = new Map<string, any>();

  for (const file of files) {
    if (file.name.startsWith(".")) continue; // Skip hidden files

    try {
      const arrayBuffer = await file.arrayBuffer();
      // dcmjs DicomMessage.readFile() requires parsing the DICOM part 10 format
      const dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer);
      const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.dict);

      // Extract key hierarchy UIDs
      const studyInstanceUID = dataset.StudyInstanceUID;
      const seriesInstanceUID = dataset.SeriesInstanceUID;
      const sopInstanceUID = dataset.SOPInstanceUID;

      if (!studyInstanceUID || !seriesInstanceUID || !sopInstanceUID) {
        continue;
      }

      // Group into Studies
      if (!studyMap.has(studyInstanceUID)) {
        studyMap.set(studyInstanceUID, {
          StudyInstanceUID: studyInstanceUID,
          StudyDescription: dataset.StudyDescription || "No Description",
          StudyDate: dataset.StudyDate || "",
          PatientName: typeof dataset.PatientName === "string" ? dataset.PatientName : (dataset.PatientName?.Alphabetic || "Unknown"),
          PatientID: dataset.PatientID || "Unknown",
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
          SeriesDescription: dataset.SeriesDescription || "",
          SeriesNumber: dataset.SeriesNumber !== undefined ? dataset.SeriesNumber : 1,
          Modality: dataset.Modality || "UNKNOWN",
          instances: []
        });
        study.series.push(study._seriesMap.get(seriesInstanceUID));
      }

      const series = study._seriesMap.get(seriesInstanceUID);

      // Add instance
      series.instances.push({
        metadata: {
          ...dataset,
        },
        // We will assign a temporary placeholder URL, which we will later replace dynamically
        url: `dicomweb:blob://${file.name}`,
        file: file // Hang onto the original File object for uploading
      });

    } catch (e) {
      console.warn(`Failed to parse DICOM file ${file.name}`, e);
    }
  }

  // Finalize the manifest structure
  for (const study of studyMap.values()) {
    delete study._seriesMap;
    result.studies.push(study);
  }

  return result;
}
