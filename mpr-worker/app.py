"""
Flask HTTP API for the MPR Worker.
Provides /health and /process endpoints.
"""

import os
import time
import logging
import threading

import requests
from flask import Flask, request, jsonify
from mpr_processor import process_mpr

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint for Docker."""
    return jsonify({"status": "ok"}), 200


@app.route('/process', methods=['POST'])
def process():
    """
    Process an MPR job.
    
    Expected JSON body:
    {
        "jobId": "uuid",
        "studyInstanceUID": "1.2.840...",
        "seriesInstanceUID": "1.2.840...",
        "seriesDescription": "CT Arterial Phase",
        "storageKeys": ["cases/abc/dicom/123-slice001.dcm", ...],
        "outputPrefix": "cases/abc/dicom/mpr/job-uuid",
        "callbackUrl": "http://app:3000/api/mpr/callback"
    }
    """
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No JSON body provided"}), 400

    required_fields = ['jobId', 'storageKeys', 'outputPrefix', 'callbackUrl']
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing required field: {field}"}), 400

    job_id = data['jobId']
    storage_keys = data['storageKeys']
    output_prefix = data['outputPrefix']
    callback_url = data['callbackUrl']
    series_description = data.get('seriesDescription', '')
    max_dim = int(os.environ.get('MPR_DOWNSAMPLE_THRESHOLD', '512'))

    logger.info(f"Starting MPR job {job_id}: {len(storage_keys)} files, "
                f"series='{series_description}'")

    # Send a progress callback to mark as PROCESSING
    send_callback(callback_url, {
        "jobId": job_id,
        "status": "PROCESSING",
        "progress": 1,
    })

    start_time = time.time()

    try:
        def progress_callback(progress):
            """Send progress updates to the Node.js API."""
            send_callback(callback_url, {
                "jobId": job_id,
                "status": "PROCESSING",
                "progress": min(progress, 95),
            })

        # Run the actual MPR processing
        results = process_mpr(
            storage_keys=storage_keys,
            output_prefix=output_prefix,
            series_description=series_description,
            max_dim=max_dim,
            progress_callback=progress_callback,
        )

        processing_time = int(time.time() - start_time)

        logger.info(f"MPR job {job_id} completed in {processing_time}s")

        # Send completion callback
        send_callback(callback_url, {
            "jobId": job_id,
            "status": "COMPLETED",
            "derivedSeriesKeys": results,
            "processingTime": processing_time,
            "instanceCount": len(storage_keys),
        })

        return jsonify({
            "jobId": job_id,
            "status": "COMPLETED",
            "processingTime": processing_time,
        }), 200

    except Exception as e:
        processing_time = int(time.time() - start_time)
        error_msg = str(e)
        logger.error(f"MPR job {job_id} failed after {processing_time}s: {error_msg}")

        # Send failure callback
        send_callback(callback_url, {
            "jobId": job_id,
            "status": "FAILED",
            "errorMessage": error_msg,
            "processingTime": processing_time,
        })

        return jsonify({
            "jobId": job_id,
            "status": "FAILED",
            "error": error_msg,
        }), 500


def send_callback(url, data):
    """Send a callback to the Node.js API. Non-blocking, fire-and-forget."""
    try:
        response = requests.post(url, json=data, timeout=10)
        if response.status_code != 200:
            logger.warning(f"Callback to {url} returned {response.status_code}: {response.text}")
    except Exception as e:
        logger.warning(f"Failed to send callback to {url}: {e}")


if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5100))
    app.run(host='0.0.0.0', port=port, debug=False)
