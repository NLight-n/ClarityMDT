"""
Core MPR processing logic.
Downloads DICOM series from MinIO, constructs 3D volume,
generates Sagittal and Coronal slices as proper DICOM files,
and uploads them back to MinIO.

Memory optimization: processes ONE plane at a time, freeing memory between planes.
"""

import os
import io
import gc
import time
import tempfile
import logging

import numpy as np
import SimpleITK as sitk
import pydicom

from minio import Minio
from dicom_utils import (
    generate_dicom_uid,
    sort_dicom_datasets,
    create_derived_dicom,
)

logger = logging.getLogger(__name__)


def get_minio_client():
    """Create MinIO client from environment variables."""
    return Minio(
        endpoint=f"{os.environ['MINIO_ENDPOINT']}:{os.environ.get('MINIO_PORT', '9000')}",
        access_key=os.environ['MINIO_ACCESS_KEY'],
        secret_key=os.environ['MINIO_SECRET_KEY'],
        secure=os.environ.get('MINIO_SSL', 'false').lower() == 'true',
    )


def download_dicom_files(minio_client, bucket, storage_keys):
    """
    Download DICOM files from MinIO and parse them.
    Returns a list of pydicom datasets.
    """
    datasets = []
    for key in storage_keys:
        try:
            response = minio_client.get_object(bucket, key)
            data = response.read()
            response.close()
            response.release_conn()

            ds = pydicom.dcmread(io.BytesIO(data))
            datasets.append(ds)
        except Exception as e:
            logger.warning(f"Failed to download/parse DICOM file {key}: {e}")
            continue

    return datasets


def build_volume(datasets):
    """
    Build a 3D volume from sorted DICOM datasets using SimpleITK.
    
    Returns:
        tuple: (sitk.Image volume, reference_ds, spacing, origin, direction)
    """
    # Sort datasets by position
    sorted_ds = sort_dicom_datasets(datasets)

    if len(sorted_ds) < 3:
        raise ValueError(f"Need at least 3 slices to build volume, got {len(sorted_ds)}")

    # Extract pixel arrays and build 3D numpy array
    slices = []
    for ds in sorted_ds:
        arr = ds.pixel_array.astype(np.int16)
        
        # Apply RescaleSlope and RescaleIntercept if present
        slope = float(getattr(ds, 'RescaleSlope', 1))
        intercept = float(getattr(ds, 'RescaleIntercept', 0))
        if slope != 1 or intercept != 0:
            arr = (arr * slope + intercept).astype(np.int16)
        
        slices.append(arr)

    volume_array = np.stack(slices, axis=0)  # shape: (Z, Y, X)

    # Extract spatial information from DICOM tags
    ref_ds = sorted_ds[0]
    
    pixel_spacing = [float(v) for v in getattr(ref_ds, 'PixelSpacing', [1.0, 1.0])]
    
    # Calculate slice spacing from first two slices
    if len(sorted_ds) >= 2:
        pos1 = [float(v) for v in sorted_ds[0].ImagePositionPatient]
        pos2 = [float(v) for v in sorted_ds[1].ImagePositionPatient]
        slice_spacing = abs(pos2[2] - pos1[2])
        if slice_spacing == 0:
            slice_spacing = float(getattr(ref_ds, 'SliceThickness', 1.0))
    else:
        slice_spacing = float(getattr(ref_ds, 'SliceThickness', 1.0))

    # Spacing: [X, Y, Z] for SimpleITK
    spacing = [pixel_spacing[1], pixel_spacing[0], slice_spacing]

    # Origin from first slice
    origin = [float(v) for v in getattr(ref_ds, 'ImagePositionPatient', [0.0, 0.0, 0.0])]

    # Direction cosines
    iop = [float(v) for v in getattr(ref_ds, 'ImageOrientationPatient', [1, 0, 0, 0, 1, 0])]
    row_cosine = np.array(iop[0:3])
    col_cosine = np.array(iop[3:6])
    normal = np.cross(row_cosine, col_cosine)
    direction = list(row_cosine) + list(col_cosine) + list(normal)

    # Create SimpleITK image
    sitk_image = sitk.GetImageFromArray(volume_array)
    sitk_image.SetSpacing(spacing)
    sitk_image.SetOrigin(origin)
    sitk_image.SetDirection(direction)

    return sitk_image, ref_ds, spacing, origin, direction


def downsample_volume(volume, max_dim=512):
    """
    Downsample volume if any dimension exceeds max_dim.
    Uses anti-aliased resampling to preserve image quality.
    """
    size = volume.GetSize()  # (X, Y, Z)
    
    # Check if downsampling is needed
    if max(size) <= max_dim:
        return volume

    # Calculate new size maintaining aspect ratio
    scale = max_dim / max(size)
    new_size = [max(1, int(s * scale)) for s in size]
    
    # Calculate new spacing
    original_spacing = volume.GetSpacing()
    new_spacing = [
        original_spacing[i] * (size[i] / new_size[i])
        for i in range(3)
    ]

    logger.info(f"Downsampling volume from {size} to {new_size}")

    # Resample with anti-aliasing (Gaussian smoothing + linear interpolation)
    resampler = sitk.ResampleImageFilter()
    resampler.SetSize(new_size)
    resampler.SetOutputSpacing(new_spacing)
    resampler.SetOutputOrigin(volume.GetOrigin())
    resampler.SetOutputDirection(volume.GetDirection())
    resampler.SetInterpolator(sitk.sitkLinear)
    resampler.SetDefaultPixelValue(-1024)  # Air in HU

    # Apply Gaussian smoothing before downsampling to prevent aliasing
    sigma = [
        original_spacing[i] * (size[i] / new_size[i] - 1) * 0.5
        for i in range(3)
    ]
    sigma = [max(0.0, s) for s in sigma]
    if any(s > 0 for s in sigma):
        volume = sitk.SmoothingRecursiveGaussian(volume, sigma)

    return resampler.Execute(volume)


def generate_plane_slices(volume, plane, reference_ds, output_prefix, 
                          minio_client, bucket, series_description,
                          progress_callback=None, progress_base=0, progress_range=45):
    """
    Generate DICOM slices for a single plane from the volume.
    
    Args:
        volume: SimpleITK image (3D volume)
        plane: "sagittal" or "coronal"
        reference_ds: Reference DICOM dataset for metadata
        output_prefix: MinIO storage prefix for output files
        minio_client: MinIO client
        bucket: MinIO bucket name
        series_description: Description for the derived series
        progress_callback: Callback function(progress_percent) for progress updates
        progress_base: Base progress percentage (for multi-plane progress tracking)
        progress_range: Range of progress this plane covers
    
    Returns:
        dict: { seriesUID, storagePrefix, sliceCount }
    """
    volume_array = sitk.GetArrayFromImage(volume)  # shape: (Z, Y, X)
    spacing = volume.GetSpacing()  # (X_spacing, Y_spacing, Z_spacing)
    origin = volume.GetOrigin()    # (X_origin, Y_origin, Z_origin)
    
    series_uid = generate_dicom_uid()
    plane_prefix = f"{output_prefix}/{plane}"
    
    if plane == "sagittal":
        # Iterate along X axis
        num_slices = volume_array.shape[2]  # X dimension
        orientation = [0.0, 1.0, 0.0, 0.0, 0.0, -1.0]
        pixel_spacing_out = [spacing[2], spacing[1]]  # [Z_spacing, Y_spacing]
        slice_thickness = spacing[0]  # X_spacing
        series_number = 9001
    elif plane == "coronal":
        # Iterate along Y axis
        num_slices = volume_array.shape[1]  # Y dimension
        orientation = [1.0, 0.0, 0.0, 0.0, 0.0, -1.0]
        pixel_spacing_out = [spacing[2], spacing[0]]  # [Z_spacing, X_spacing]
        slice_thickness = spacing[1]  # Y_spacing
        series_number = 9002
    else:
        raise ValueError(f"Unknown plane: {plane}")

    logger.info(f"Generating {num_slices} {plane} slices")

    for i in range(num_slices):
        # Extract 2D slice
        if plane == "sagittal":
            slice_2d = volume_array[::-1, :, i]  # (Z, Y) — flip Z for correct orientation
            position = [
                origin[0] + i * spacing[0],
                origin[1],
                origin[2]
            ]
        else:  # coronal
            slice_2d = volume_array[::-1, i, :]  # (Z, X) — flip Z for correct orientation
            position = [
                origin[0],
                origin[1] + i * spacing[1],
                origin[2]
            ]

        sop_uid = generate_dicom_uid()

        # Create DICOM dataset
        dcm_ds = create_derived_dicom(
            pixel_data=slice_2d,
            reference_ds=reference_ds,
            series_uid=series_uid,
            sop_uid=sop_uid,
            instance_number=i + 1,
            image_orientation=orientation,
            image_position=position,
            pixel_spacing=pixel_spacing_out,
            slice_thickness=slice_thickness,
            series_description=series_description,
            series_number=series_number,
            total_slices=num_slices,
        )

        # Write to buffer and upload to MinIO
        buffer = io.BytesIO()
        dcm_ds.save_as(buffer)
        buffer.seek(0)
        
        storage_key = f"{plane_prefix}/{str(i).zfill(6)}.dcm"
        minio_client.put_object(
            bucket,
            storage_key,
            buffer,
            length=buffer.getbuffer().nbytes,
            content_type="application/dicom",
        )

        # Report progress
        if progress_callback and num_slices > 0:
            slice_progress = progress_base + int((i + 1) / num_slices * progress_range)
            progress_callback(slice_progress)

    # Get dimensions from the first generated slice
    if plane == "sagittal":
        first_slice = volume_array[::-1, :, 0]
    else:
        first_slice = volume_array[::-1, 0, :]

    return {
        "seriesUID": series_uid,
        "storagePrefix": plane_prefix,
        "sliceCount": num_slices,
        "rows": int(first_slice.shape[0]),
        "columns": int(first_slice.shape[1]),
        "modality": getattr(reference_ds, 'Modality', 'CT'),
        "bitsAllocated": 16,
        "pixelSpacing": [str(v) for v in pixel_spacing_out],
        "sliceThickness": float(slice_thickness),
        "sopClassUID": "1.2.840.10008.5.1.4.1.1.2",  # CT Image Storage
        "imageOrientation": [str(v) for v in orientation],
    }


def process_mpr(storage_keys, output_prefix, series_description="",
                max_dim=512, progress_callback=None):
    """
    Main MPR processing function.
    
    Downloads DICOM files, builds volume, generates Sagittal and Coronal
    series, and uploads them to MinIO.
    
    Memory optimization: processes one plane at a time, freeing memory between.
    
    Args:
        storage_keys: List of MinIO storage keys for the source DICOM files
        output_prefix: MinIO storage prefix for output (e.g., "cases/abc/dicom/mpr/job-123")
        series_description: Source series description (used as suffix)
        max_dim: Max dimension before downsampling (default: 512)
        progress_callback: Callback function(progress_percent)
    
    Returns:
        dict: {
            "sagittal": { "seriesUID": ..., "storagePrefix": ..., "sliceCount": N },
            "coronal":  { "seriesUID": ..., "storagePrefix": ..., "sliceCount": N }
        }
    """
    bucket = os.environ.get('MINIO_BUCKET', 'claritymdt')
    minio_client = get_minio_client()

    if progress_callback:
        progress_callback(2)

    # Step 1: Download DICOM files
    logger.info(f"Downloading {len(storage_keys)} DICOM files...")
    datasets = download_dicom_files(minio_client, bucket, storage_keys)
    
    if len(datasets) < 3:
        raise ValueError(f"Insufficient DICOM files: need >= 3, got {len(datasets)}")

    if progress_callback:
        progress_callback(10)

    # Step 2: Build 3D volume
    logger.info("Building 3D volume...")
    volume, reference_ds, spacing, origin_pt, direction = build_volume(datasets)
    
    # Free the raw datasets to save memory
    del datasets
    gc.collect()

    if progress_callback:
        progress_callback(20)

    # Step 3: Downsample if needed
    volume = downsample_volume(volume, max_dim=max_dim)

    if progress_callback:
        progress_callback(25)

    results = {}

    # Step 4: Generate Sagittal slices (progress: 25-55%)
    logger.info("Generating Sagittal plane...")
    sag_desc = f"MPR Sagittal - {series_description}" if series_description else "MPR Sagittal"
    results["sagittal"] = generate_plane_slices(
        volume=volume,
        plane="sagittal",
        reference_ds=reference_ds,
        output_prefix=output_prefix,
        minio_client=minio_client,
        bucket=bucket,
        series_description=sag_desc,
        progress_callback=progress_callback,
        progress_base=25,
        progress_range=30,
    )

    # Free memory before next plane
    gc.collect()

    if progress_callback:
        progress_callback(58)

    # Step 5: Generate Coronal slices (progress: 58-90%)
    logger.info("Generating Coronal plane...")
    cor_desc = f"MPR Coronal - {series_description}" if series_description else "MPR Coronal"
    results["coronal"] = generate_plane_slices(
        volume=volume,
        plane="coronal",
        reference_ds=reference_ds,
        output_prefix=output_prefix,
        minio_client=minio_client,
        bucket=bucket,
        series_description=cor_desc,
        progress_callback=progress_callback,
        progress_base=58,
        progress_range=32,
    )

    # Final cleanup
    del volume
    del reference_ds
    gc.collect()

    if progress_callback:
        progress_callback(95)

    logger.info(f"MPR processing complete. Sagittal: {results['sagittal']['sliceCount']} slices, "
                f"Coronal: {results['coronal']['sliceCount']} slices")

    return results
