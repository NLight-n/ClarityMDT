"use strict";

(function () {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const parser = globalThis.ClarityHmsParser;
  if (!parser) return;

  function formatPayloadForTarget(payload, targetApp) {
    if (!payload) return payload;
    const formattedMrn =
      targetApp === "irlog" && payload.mrn
        ? String(payload.mrn).trim().replace(/^sn0*/i, "")
        : payload.mrn;
    return {
      ...payload,
      mrn: formattedMrn,
      patientName: payload.patientName
        ? parser.formatPatientName(payload.patientName, targetApp)
        : "",
    };
  }

  function postPrefillToPage(payload, targetApp) {
    const messageType =
      targetApp === "irlog" ? "IRLOG_HMS_PREFILL" : "CLARITY_MDT_PREFILL";
    window.postMessage(
      {
        type: messageType,
        payload: formatPayloadForTarget(payload, targetApp),
      },
      window.location.origin
    );
  }

  async function consumePendingPushPrefill(targetApp) {
    try {
      const res = await extApi.runtime.sendMessage({
        type: "CONSUME_PENDING_PREFILL",
      });
      if (res && res.ok && res.payload) {
        requestAnimationFrame(() => {
          postPrefillToPage(res.payload, targetApp);
        });
      }
    } catch (_err) {
      // Ignore if no pending prefill
    }
  }

  function getTargetContext() {
    const pathname = window.location.pathname;
    if (pathname.startsWith("/cases/new")) {
      return {
        targetApp: "clarity",
        mrnInput: document.getElementById("mrn"),
        mrnRow: document.getElementById("mrn-input-row"),
      };
    }
    if (pathname.startsWith("/irlog")) {
      return {
        targetApp: "irlog",
        mrnInput: document.querySelector('input[name="patientID"]'),
        mrnRow: null,
      };
    }
    return null;
  }

  function normalizeMrn(rawMrn) {
    const trimmed = String(rawMrn || "").trim();
    if (!trimmed) return "";
    if (/^\d{1,8}$/.test(trimmed)) return `SN${trimmed.padStart(8, "0")}`;
    if (/^sn\d{1,8}$/i.test(trimmed)) return `SN${trimmed.slice(2).padStart(8, "0")}`;
    return trimmed;
  }

  async function lookupPatientFromHms(rawMrn) {
    const mrn = normalizeMrn(rawMrn);
    if (!mrn) return { ok: false, error: "MISSING_MRN" };

    const res = await extApi.runtime.sendMessage({
      type: "FETCH_PATIENT_BY_MRN",
      mrn,
    });

    if (!res || !res.ok) {
      return {
        ok: false,
        error: (res && res.error) || "unknown",
        detail: res && res.detail ? res.detail : "",
      };
    }

    const doc = new DOMParser().parseFromString(res.html, "text/html");
    if (parser.isInstaHmsLoginPage(doc)) {
      return { ok: false, error: "NOT_LOGGED_IN" };
    }

    const patient = parser.parseInstaHmsPatient(doc);
    if (!patient) {
      return { ok: false, error: "NOT_FOUND" };
    }

    return { ok: true, patient };
  }

  // Listen for on-blur HMS lookup requests from IRLog forms
  if (window.location.pathname.startsWith("/irlog")) {
    window.addEventListener("message", async (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!event.data) return;

      if (event.data.type === "IRLOG_READY_FOR_PREFILL") {
        consumePendingPushPrefill("irlog");
        return;
      }

      if (event.data.type === "IRLOG_OPEN_PACS") {
        const mrn = String(event.data.mrn || "").trim();
        if (mrn) {
          extApi.runtime.sendMessage({
            type: "OPEN_PACS_BY_MRN",
            mrn,
          });
        }
        return;
      }

      if (event.data.type === "IRLOG_HMS_LOOKUP_REQUEST") {
        const { requestId, mrn } = event.data;
        try {
          const result = await lookupPatientFromHms(mrn);
          window.postMessage(
            {
              type: "IRLOG_HMS_LOOKUP_RESULT",
              requestId,
              ok: result.ok,
              payload: result.ok
                ? formatPayloadForTarget(result.patient, "irlog")
                : null,
              error: result.ok ? null : result.error,
            },
            window.location.origin
          );
        } catch (_err) {
          window.postMessage(
            {
              type: "IRLOG_HMS_LOOKUP_RESULT",
              requestId,
              ok: false,
              payload: null,
              error: "EXTENSION_ERROR",
            },
            window.location.origin
          );
        }
      }
    });
  }

  function attachFetchButton() {
    const ctx = getTargetContext();
    if (!ctx || ctx.targetApp !== "clarity") return;

    const { mrnInput, mrnRow } = ctx;
    if (!mrnInput || mrnInput.dataset.hmsBridgeAttached === "true") return;

    mrnInput.dataset.hmsBridgeAttached = "true";

    const btn = document.createElement("button");
    btn.id = "clarity-fetch-hms-btn";
    btn.type = "button";
    btn.textContent = "Fetch from HMS";
    btn.style.cssText =
      "background:#0f766e;color:#ffffff;border:none;border-radius:6px;padding:0 12px;height:36px;cursor:pointer;font-size:12px;font-weight:500;white-space:nowrap;flex-shrink:0;";

    const status = document.createElement("div");
    status.style.cssText = "font-size:12px;color:#64748b;margin-top:4px;";

    btn.addEventListener("click", async () => {
      const rawMrn = mrnInput.value.trim();
      if (!rawMrn) {
        status.textContent = "Enter an MRN first.";
        status.style.color = "#b91c1c";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Fetching...";
      status.textContent = "";

      try {
        const result = await lookupPatientFromHms(rawMrn);

        if (!result.ok) {
          if (result.error === "NOT_LOGGED_IN") {
            status.textContent = "Please sign into InstaHMS in another tab first.";
          } else if (result.error === "NOT_FOUND") {
            status.textContent = "No patient found for this MRN in InstaHMS.";
          } else {
            const detail = result.detail ? `: ${result.detail}` : "";
            status.textContent = `HMS lookup failed (${result.error}${detail}).`;
          }
          status.style.color = "#b91c1c";
          return;
        }

        const patient = result.patient;
        postPrefillToPage(patient, "clarity");
        status.textContent = patient.ageNote
          ? `Loaded (${patient.ageNote})`
          : "Patient details loaded from HMS.";
        status.style.color = "#0f766e";
      } catch (_err) {
        status.textContent = "Extension communication error.";
        status.style.color = "#b91c1c";
      } finally {
        btn.disabled = false;
        btn.textContent = "Fetch from HMS";
      }
    });

    if (mrnRow) {
      mrnRow.appendChild(btn);
      mrnRow.insertAdjacentElement("afterend", status);
    } else {
      mrnInput.insertAdjacentElement("afterend", btn);
      btn.insertAdjacentElement("afterend", status);
    }

    // Once #mrn is mounted, the React listener is also mounted — safe to replay Push payload
    consumePendingPushPrefill("clarity");
  }

  function attachCaseDetailPacsButton() {
    const pathname = window.location.pathname;
    if (!/^\/cases\/[^/]+/.test(pathname) || pathname.startsWith("/cases/new")) {
      return;
    }

    const candidates = document.querySelectorAll("div.rounded-full");
    for (const badge of candidates) {
      const text = (badge.textContent || "").trim();
      const match = text.match(/^MRN:\s*(.+)$/i);
      if (!match) continue;

      if (badge.dataset.pacsBridgeAttached === "true") return;
      badge.dataset.pacsBridgeAttached = "true";

      const mrn = match[1].trim();
      if (!mrn) return;

      const pacsBtn = document.createElement("button");
      pacsBtn.id = "clarity-case-pacs-btn";
      pacsBtn.type = "button";
      pacsBtn.textContent = "PACS";
      pacsBtn.title = "Open studies in Medsynapse PACS";
      pacsBtn.style.cssText =
        "background:#1e40af;color:#ffffff;border:none;border-radius:9999px;padding:2px 10px;cursor:pointer;font-size:12px;font-weight:600;line-height:1.4;white-space:nowrap;";

      pacsBtn.addEventListener("click", async () => {
        const liveText = (badge.textContent || "").trim();
        const liveMatch = liveText.match(/^MRN:\s*(.+)$/i);
        const liveMrn = liveMatch ? liveMatch[1].trim() : mrn;
        if (!liveMrn) return;
        await extApi.runtime.sendMessage({
          type: "OPEN_PACS_BY_MRN",
          mrn: liveMrn,
        });
      });

      badge.insertAdjacentElement("afterend", pacsBtn);
      return;
    }
  }

  function attachIrlogViewPacsButton() {
    if (!window.location.pathname.startsWith("/irlog")) return;

    const groups = document.querySelectorAll(".form-group");
    for (const group of groups) {
      const label = group.querySelector("label.form-label");
      if (!label || (label.textContent || "").trim() !== "Patient ID") continue;

      const valueDiv = group.querySelector("div.form-input");
      if (!valueDiv || valueDiv.dataset.pacsBridgeAttached === "true") continue;

      // Skip if IRLog's native React PACS button is already rendered
      if (valueDiv.parentElement && valueDiv.parentElement.querySelector("button")) {
        valueDiv.dataset.pacsBridgeAttached = "true";
        continue;
      }

      const mrn = (valueDiv.textContent || "").trim();
      if (!mrn) continue;

      valueDiv.dataset.pacsBridgeAttached = "true";

      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;";
      valueDiv.style.flex = "1";
      valueDiv.style.minWidth = "0";
      valueDiv.parentNode.insertBefore(row, valueDiv);
      row.appendChild(valueDiv);

      const pacsBtn = document.createElement("button");
      pacsBtn.id = "irlog-ext-pacs-btn";
      pacsBtn.type = "button";
      pacsBtn.textContent = "PACS";
      pacsBtn.title = "Open studies in Medsynapse PACS";
      pacsBtn.style.cssText =
        "appearance:none !important;-webkit-appearance:none !important;background-color:#1e40af !important;background-image:none !important;color:#ffffff !important;border:0 !important;border-radius:4px !important;padding:4px 10px !important;height:auto !important;min-width:auto !important;width:auto !important;cursor:pointer !important;font-size:12px !important;font-weight:600 !important;line-height:1.4 !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;white-space:nowrap !important;flex-shrink:0 !important;box-shadow:none !important;";

      pacsBtn.addEventListener("click", async () => {
        const liveMrn = (valueDiv.textContent || "").trim();
        if (!liveMrn) return;
        await extApi.runtime.sendMessage({
          type: "OPEN_PACS_BY_MRN",
          mrn: liveMrn,
        });
      });

      row.appendChild(pacsBtn);
    }
  }

  // Intercept saved PACS study links (#mrn=...&suid=...) so they open safely via extension
  document.addEventListener(
    "click",
    (e) => {
      const anchor = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("http://192.168.10.222/PACSStudyList#")) return;

      try {
        const hashParams = new URLSearchParams(new URL(href).hash.slice(1));
        const mrn = (hashParams.get("mrn") || "").trim();
        const suid = (hashParams.get("suid") || "").trim();
        if (!mrn) return;

        e.preventDefault();
        e.stopPropagation();
        extApi.runtime.sendMessage({
          type: "OPEN_PACS_BY_MRN",
          mrn,
          suid,
        });
      } catch (_err) {
        // Ignore malformed URLs
      }
    },
    true
  );

  // Next.js NewCasePage / CaseDetailPage / IRLog modals render asynchronously
  const observer = new MutationObserver(() => {
    attachFetchButton();
    attachCaseDetailPacsButton();
    attachIrlogViewPacsButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  attachFetchButton();
  attachCaseDetailPacsButton();
  attachIrlogViewPacsButton();
})();
