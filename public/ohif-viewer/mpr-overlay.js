/**
 * ClarityMDT Server-Side MPR Overlay for OHIF Viewer
 * 
 * Injects a floating button into the OHIF viewer that allows users to
 * trigger server-side MPR processing for individual series. The derived
 * Sagittal/Coronal series appear as normal selectable series after reload.
 * 
 * This script is completely independent of OHIF's React tree.
 * It uses vanilla JS + inline CSS with position:fixed z-index:99999.
 */
(function () {
  'use strict';

  // --- Configuration ---
  const MIN_SLICES_FOR_MPR = 20;
  const POLL_INTERVAL_MS = 3000;
  const RELOAD_DELAY_MS = 1500;

  // --- Helpers ---
  function getAttachmentId() {
    const params = new URLSearchParams(window.location.search);
    const manifestUrl = params.get('url');
    if (!manifestUrl) return null;
    // URL pattern: /api/dicom-manifest/{attachmentId}
    const match = manifestUrl.match(/\/api\/dicom-manifest\/([^/?]+)/);
    return match ? match[1] : null;
  }

  // Only activate on viewer pages with a manifest URL
  if (!getAttachmentId()) return;

  // --- Styles ---
  const STYLES = `
    #mpr-overlay-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4), 0 2px 8px rgba(0,0,0,0.2);
      transition: all 0.2s ease;
      letter-spacing: 0.3px;
    }
    #mpr-overlay-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 28px rgba(99, 102, 241, 0.5), 0 4px 12px rgba(0,0,0,0.3);
    }
    #mpr-overlay-btn:active {
      transform: translateY(0);
    }

    #mpr-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    #mpr-modal-backdrop.visible { opacity: 1; }

    #mpr-modal {
      background: #1e1e2e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      width: 480px;
      max-width: 90vw;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 80px rgba(0,0,0,0.5);
      font-family: Inter, system-ui, -apple-system, sans-serif;
      color: #e4e4e7;
    }

    .mpr-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .mpr-modal-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #fff;
    }
    .mpr-modal-close {
      background: none;
      border: none;
      color: #a1a1aa;
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
      transition: all 0.15s;
    }
    .mpr-modal-close:hover { background: rgba(255,255,255,0.1); color: #fff; }

    .mpr-modal-body {
      padding: 16px 24px;
      overflow-y: auto;
      flex: 1;
    }
    .mpr-modal-body p.mpr-desc {
      font-size: 12px;
      color: #a1a1aa;
      margin: 0 0 16px 0;
      line-height: 1.5;
    }

    .mpr-series-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mpr-series-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      transition: all 0.15s;
    }
    .mpr-series-item:hover {
      background: rgba(255,255,255,0.07);
      border-color: rgba(255,255,255,0.1);
    }

    .mpr-series-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1;
    }
    .mpr-series-name {
      font-size: 13px;
      font-weight: 600;
      color: #f4f4f5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mpr-series-meta {
      font-size: 11px;
      color: #71717a;
    }

    .mpr-series-action {
      margin-left: 12px;
      flex-shrink: 0;
    }

    .mpr-btn-generate {
      padding: 6px 14px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .mpr-btn-generate:hover {
      box-shadow: 0 2px 12px rgba(99,102,241,0.4);
      transform: translateY(-1px);
    }
    .mpr-btn-generate:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .mpr-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .mpr-status-ready {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }
    .mpr-status-processing {
      background: rgba(234, 179, 8, 0.15);
      color: #fbbf24;
    }
    .mpr-status-failed {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
    .mpr-status-toofew {
      color: #52525b;
      font-size: 11px;
      font-weight: 500;
    }

    .mpr-progress-bar {
      width: 60px;
      height: 4px;
      background: rgba(255,255,255,0.1);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 4px;
    }
    .mpr-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #6366f1, #8b5cf6);
      border-radius: 2px;
      transition: width 0.3s ease;
    }

    .mpr-modal-footer {
      padding: 12px 24px 16px;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mpr-modal-footer .mpr-info-text {
      font-size: 11px;
      color: #71717a;
      line-height: 1.4;
      flex: 1;
    }

    .mpr-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: #fbbf24;
      border-radius: 50%;
      animation: mpr-spin 0.8s linear infinite;
    }
    @keyframes mpr-spin {
      to { transform: rotate(360deg); }
    }

    .mpr-loading-center {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 0;
      color: #a1a1aa;
      font-size: 13px;
      gap: 10px;
    }

    .mpr-reload-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px;
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      font-size: 12px;
      font-weight: 600;
      border-radius: 8px;
      margin-top: 12px;
    }

    .mpr-btn-delete {
      padding: 4px 8px;
      background: none;
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 6px;
      color: #f87171;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
      margin-left: 6px;
    }
    .mpr-btn-delete:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.5);
    }
    .mpr-btn-delete:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `;

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  // --- State ---
  let modalOpen = false;
  let seriesData = null;
  let pollingTimers = {};

  // --- Create floating button ---
  const btn = document.createElement('button');
  btn.id = 'mpr-overlay-btn';
  btn.innerHTML = '⚡ Server MPR';
  btn.title = 'Generate server-side MPR reconstructions';
  btn.addEventListener('click', openModal);
  document.body.appendChild(btn);

  // --- Modal ---
  function openModal() {
    if (modalOpen) return;
    modalOpen = true;

    const backdrop = document.createElement('div');
    backdrop.id = 'mpr-modal-backdrop';
    backdrop.innerHTML = `
      <div id="mpr-modal">
        <div class="mpr-modal-header">
          <h2>⚡ Server-Side MPR</h2>
          <button class="mpr-modal-close" id="mpr-close-btn">&times;</button>
        </div>
        <div class="mpr-modal-body" id="mpr-modal-body">
          <div class="mpr-loading-center">
            <span class="mpr-spinner"></span>
            Loading series...
          </div>
        </div>
        <div class="mpr-modal-footer">
          <span class="mpr-info-text">
            Generates Sagittal & Coronal views as new series. 
            Viewer will reload automatically when ready.
          </span>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    // Close handlers
    document.getElementById('mpr-close-btn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Fetch series data
    fetchSeriesData();
  }

  function closeModal() {
    const backdrop = document.getElementById('mpr-modal-backdrop');
    if (backdrop) {
      backdrop.classList.remove('visible');
      setTimeout(() => backdrop.remove(), 200);
    }
    modalOpen = false;
    // Clear all polling timers
    Object.values(pollingTimers).forEach(timer => clearInterval(timer));
    pollingTimers = {};
  }

  async function fetchSeriesData() {
    const attachmentId = getAttachmentId();
    if (!attachmentId) return;

    try {
      const res = await fetch(`/api/mpr/series/${attachmentId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load series');
      }
      seriesData = await res.json();
      renderSeriesList();
    } catch (err) {
      const body = document.getElementById('mpr-modal-body');
      if (body) {
        body.innerHTML = `
          <div class="mpr-loading-center" style="color: #f87171;">
            ❌ ${err.message || 'Failed to load series data'}
          </div>
        `;
      }
    }
  }

  function renderSeriesList() {
    const body = document.getElementById('mpr-modal-body');
    if (!body || !seriesData) return;

    let html = `<p class="mpr-desc">${seriesData.studyDescription || 'DICOM Study'}</p>`;
    html += '<div class="mpr-series-list">';

    for (const series of seriesData.series) {
      html += `<div class="mpr-series-item" data-uid="${series.seriesInstanceUID}">`;
      html += `<div class="mpr-series-info">`;
      html += `<span class="mpr-series-name" title="${series.seriesDescription}">${series.seriesDescription || 'Unknown Series'}</span>`;
      html += `<span class="mpr-series-meta">${series.modality} · ${series.instanceCount} slices</span>`;
      html += `</div>`;
      html += `<div class="mpr-series-action">`;

      if (series.instanceCount < MIN_SLICES_FOR_MPR) {
        html += `<span class="mpr-status-toofew">— too few</span>`;
      } else if (series.mprStatus) {
        const s = series.mprStatus;
        if (s.status === 'COMPLETED') {
          html += `<span class="mpr-status-badge mpr-status-ready">✅ Ready</span>`;
          html += `<button class="mpr-btn-delete" data-job-id="${s.jobId}" data-uid="${series.seriesInstanceUID}" title="Delete MPR">🗑️</button>`;
        } else if (s.status === 'PROCESSING' || s.status === 'QUEUED') {
          html += `<span class="mpr-status-badge mpr-status-processing">
            <span class="mpr-spinner"></span>
            ${s.status === 'QUEUED' ? 'Queued' : `${s.progress || 0}%`}
          </span>`;
          // Start polling for this job
          startPolling(s.jobId, series.seriesInstanceUID);
        } else if (s.status === 'FAILED') {
          html += `<span class="mpr-status-badge mpr-status-failed" title="${s.errorMessage || ''}">❌ Failed</span>`;
          html += `<button class="mpr-btn-delete" data-job-id="${s.jobId}" data-uid="${series.seriesInstanceUID}" title="Delete MPR">🗑️</button>`;
          html += ` <button class="mpr-btn-generate" data-uid="${series.seriesInstanceUID}" data-desc="${series.seriesDescription}">Retry</button>`;
        }
      } else {
        html += `<button class="mpr-btn-generate" data-uid="${series.seriesInstanceUID}" data-desc="${series.seriesDescription}">Generate MPR</button>`;
      }

      html += `</div></div>`;
    }

    html += '</div>';
    body.innerHTML = html;

    // Attach click handlers
    body.querySelectorAll('.mpr-btn-generate').forEach((button) => {
      button.addEventListener('click', (e) => {
        const uid = e.target.getAttribute('data-uid');
        triggerMpr(uid);
      });
    });

    // Attach delete handlers
    body.querySelectorAll('.mpr-btn-delete').forEach((button) => {
      button.addEventListener('click', (e) => {
        const jobId = e.currentTarget.getAttribute('data-job-id');
        const uid = e.currentTarget.getAttribute('data-uid');
        deleteMpr(jobId, uid);
      });
    });
  }

  async function triggerMpr(seriesInstanceUID) {
    const attachmentId = getAttachmentId();
    if (!attachmentId || !seriesData) return;

    try {
      const res = await fetch('/api/mpr/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachmentId,
          caseId: seriesData.caseId,
          seriesInstanceUID,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to trigger MPR');
        return;
      }

      // Update local state
      const series = seriesData.series.find(s => s.seriesInstanceUID === seriesInstanceUID);
      if (series) {
        series.mprStatus = {
          jobId: data.jobId,
          status: data.status,
          progress: data.progress || 0,
        };
      }

      renderSeriesList();

      // Start polling if queued/processing
      if (data.status === 'QUEUED' || data.status === 'PROCESSING') {
        startPolling(data.jobId, seriesInstanceUID);
      } else if (data.status === 'COMPLETED') {
        handleCompletion();
      }
    } catch (err) {
      alert('Failed to trigger MPR: ' + err.message);
    }
  }

  async function deleteMpr(jobId, seriesInstanceUID) {
    if (!confirm('Delete this MPR? The derived Sagittal/Coronal series will be removed. You can re-generate them later.')) {
      return;
    }

    try {
      const res = await fetch(`/api/mpr/delete/${jobId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to delete MPR');
        return;
      }

      // Clear local state
      if (seriesData) {
        const series = seriesData.series.find(s => s.seriesInstanceUID === seriesInstanceUID);
        if (series) {
          series.mprStatus = null;
        }
      }

      renderSeriesList();

      // Reload viewer to remove derived series from the panel
      setTimeout(() => {
        window.location.reload();
      }, RELOAD_DELAY_MS);
    } catch (err) {
      alert('Failed to delete MPR: ' + err.message);
    }
  }

  function startPolling(jobId, seriesInstanceUID) {
    // Don't duplicate polling for the same job
    if (pollingTimers[jobId]) return;

    pollingTimers[jobId] = setInterval(async () => {
      try {
        const res = await fetch(`/api/mpr/status/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();

        // Update local state
        if (seriesData) {
          const series = seriesData.series.find(s => s.seriesInstanceUID === seriesInstanceUID);
          if (series) {
            series.mprStatus = {
              jobId: data.id,
              status: data.status,
              progress: data.progress,
              errorMessage: data.errorMessage,
            };
          }
        }

        // Re-render if modal is open
        if (modalOpen) {
          renderSeriesList();
        }

        // Stop polling on terminal states
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          clearInterval(pollingTimers[jobId]);
          delete pollingTimers[jobId];

          if (data.status === 'COMPLETED') {
            handleCompletion();
          }
        }
      } catch (err) {
        // Ignore polling errors
      }
    }, POLL_INTERVAL_MS);
  }

  function handleCompletion() {
    const body = document.getElementById('mpr-modal-body');
    if (body && modalOpen) {
      // Add reload banner
      const existing = body.querySelector('.mpr-reload-banner');
      if (!existing) {
        const banner = document.createElement('div');
        banner.className = 'mpr-reload-banner';
        banner.innerHTML = '✅ MPR Ready! Reloading viewer to show new series...';
        body.appendChild(banner);
      }
    }

    // Reload after a short delay
    setTimeout(() => {
      window.location.reload();
    }, RELOAD_DELAY_MS);
  }

})();
