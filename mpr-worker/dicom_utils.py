"""
DICOM utility functions for MPR processing.
Handles UID generation, DICOM dataset creation, and file sorting.
"""

import pydicom
from pydicom.uid import generate_uid
from pydicom.dataset import Dataset, FileDataset
from pydicom.sequence import Sequence
import numpy as np
import tempfile
import os
import datetime


def generate_dicom_uid():
    """Generate a DICOM-compliant UID."""
    return generate_uid()


def sort_dicom_datasets(datasets):
    """
    Sort DICOM datasets by ImagePositionPatient (Z-coordinate) 
    or InstanceNumber as fallback.
    
    Returns sorted list of datasets.
    """
    def get_sort_key(ds):
        # Try ImagePositionPatient first (most reliable for volume ordering)
        if hasattr(ds, 'ImagePositionPatient') and ds.ImagePositionPatient:
            try:
                return float(ds.ImagePositionPatient[2])
            except (IndexError, ValueError, TypeError):
                pass
        # Fall back to InstanceNumber
        if hasattr(ds, 'InstanceNumber') and ds.InstanceNumber is not None:
            try:
                return float(ds.InstanceNumber)
            except (ValueError, TypeError):
                pass
        return 0.0

    return sorted(datasets, key=get_sort_key)


def create_derived_dicom(
    pixel_data,
    reference_ds,
    series_uid,
    sop_uid,
    instance_number,
    image_orientation,
    image_position,
    pixel_spacing,
    slice_thickness,
    series_description,
    series_number,
    total_slices
):
    """
    Create a complete DICOM dataset for a derived MPR slice.
    
    Args:
        pixel_data: 2D numpy array (uint16 or int16) of pixel values
        reference_ds: A source DICOM dataset to copy patient/study metadata from
        series_uid: SeriesInstanceUID for this derived series
        sop_uid: Unique SOPInstanceUID for this slice
        instance_number: Instance number (1-based) within the series
        image_orientation: ImageOrientationPatient as list of 6 floats
        image_position: ImagePositionPatient as list of 3 floats
        pixel_spacing: [row_spacing, col_spacing]
        slice_thickness: Slice thickness in mm
        series_description: Human-readable series description
        series_number: Series number
        total_slices: Total number of slices in the derived series
    
    Returns:
        pydicom FileDataset ready to be written
    """
    # Create a temporary file for FileDataset
    filename = tempfile.mktemp(suffix='.dcm')
    
    file_meta = pydicom.Dataset()
    file_meta.MediaStorageSOPClassUID = '1.2.840.10008.5.1.4.1.1.2'  # CT Image Storage
    file_meta.MediaStorageSOPInstanceUID = sop_uid
    file_meta.TransferSyntaxUID = pydicom.uid.ExplicitVRLittleEndian

    ds = FileDataset(filename, {}, file_meta=file_meta, preamble=b"\x00" * 128)

    # --- Patient Module (copy from reference) ---
    for tag_name in [
        'PatientName', 'PatientID', 'PatientBirthDate', 'PatientSex',
        'PatientAge', 'PatientWeight'
    ]:
        if hasattr(reference_ds, tag_name):
            setattr(ds, tag_name, getattr(reference_ds, tag_name))
    
    # Ensure required patient fields exist
    if not hasattr(ds, 'PatientName'):
        ds.PatientName = 'Unknown'
    if not hasattr(ds, 'PatientID'):
        ds.PatientID = 'Unknown'

    # --- Study Module (copy from reference — same study) ---
    for tag_name in [
        'StudyInstanceUID', 'StudyDate', 'StudyTime', 'StudyDescription',
        'StudyID', 'AccessionNumber', 'ReferringPhysicianName'
    ]:
        if hasattr(reference_ds, tag_name):
            setattr(ds, tag_name, getattr(reference_ds, tag_name))

    # --- Series Module (new derived series) ---
    ds.SeriesInstanceUID = series_uid
    ds.SeriesDescription = series_description
    ds.SeriesNumber = series_number
    ds.Modality = getattr(reference_ds, 'Modality', 'CT')
    
    # --- General Equipment Module ---
    ds.Manufacturer = 'ClarityMDT MPR'
    ds.InstitutionName = getattr(reference_ds, 'InstitutionName', '')
    ds.StationName = 'MPR-SERVER'
    ds.SoftwareVersions = '1.0'

    # --- Image Module ---
    ds.SOPClassUID = '1.2.840.10008.5.1.4.1.1.2'  # CT Image Storage
    ds.SOPInstanceUID = sop_uid
    ds.InstanceNumber = instance_number
    ds.ImageType = ['DERIVED', 'SECONDARY', 'MPR']
    ds.DerivationDescription = 'Server-side MPR reconstruction by ClarityMDT'

    # --- Image Orientation & Position ---
    ds.ImageOrientationPatient = [str(v) for v in image_orientation]
    ds.ImagePositionPatient = [str(v) for v in image_position]
    ds.PixelSpacing = [str(v) for v in pixel_spacing]
    ds.SliceThickness = str(slice_thickness)

    # --- Frame of Reference (copy from reference) ---
    if hasattr(reference_ds, 'FrameOfReferenceUID'):
        ds.FrameOfReferenceUID = reference_ds.FrameOfReferenceUID
    if hasattr(reference_ds, 'PositionReferenceIndicator'):
        ds.PositionReferenceIndicator = reference_ds.PositionReferenceIndicator

    # --- Pixel Data ---
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = 'MONOCHROME2'
    ds.Rows = pixel_data.shape[0]
    ds.Columns = pixel_data.shape[1]
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 1  # Signed (int16 for CT with negative HU values)

    # Copy window/level from reference if available
    if hasattr(reference_ds, 'WindowCenter'):
        ds.WindowCenter = reference_ds.WindowCenter
    if hasattr(reference_ds, 'WindowWidth'):
        ds.WindowWidth = reference_ds.WindowWidth

    # Rescale: pixel data is ALREADY in Hounsfield Units (rescale was applied
    # during volume building in build_volume()). Set identity rescale so OHIF
    # doesn't apply the transform a second time.
    ds.RescaleIntercept = '0'
    ds.RescaleSlope = '1'
    ds.RescaleType = 'HU'

    # Set pixel data
    ds.PixelData = pixel_data.astype(np.int16).tobytes()

    # --- Content Date/Time ---
    now = datetime.datetime.now()
    ds.ContentDate = now.strftime('%Y%m%d')
    ds.ContentTime = now.strftime('%H%M%S.%f')
    ds.InstanceCreationDate = ds.ContentDate
    ds.InstanceCreationTime = ds.ContentTime

    # Ensure we have a NumberOfFrames entry of 1
    ds.NumberOfFrames = 1

    return ds
