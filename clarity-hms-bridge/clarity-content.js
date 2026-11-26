"use strict";

(function () {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const parser = globalThis.ClarityHmsParser;
  if (!parser) return;

  function postPrefillToPage(payload) {
    window.postMessage(
      {
        type: "CLARITY_MDT_PREFILL",
        payload,
      },
      window.location.origin
    );
  }

  async function consumePendingPushPrefill() {
    try {
      const res = await extApi.runtime.sendMessage({
        type: "CONSUME_PENDING_PREFILL",
      });
      if (res && res.ok && res.payload) {
        requestAnimationFrame(() => {
          postPrefillToPage(res.payload);
        });
      }
    } catch (_err) {
      // Ignore if no pending prefill
    }
  }

  function attachFetchButton() {
    if (!window.location.pathname.startsWith("/cases/new")) return;

    const mrnInput = document.getElementById("mrn");
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
      const mrn = mrnInput.value.trim();
      if (!mrn) {
        status.textContent = "Enter an MRN first.";
        status.style.color = "#b91c1c";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Fetching...";
      status.textContent = "";

      try {
        const res = await extApi.runtime.sendMessage({
          type: "FETCH_PATIENT_BY_MRN",
          mrn,
        });

        if (!res || !res.ok) {
          if (res && res.error === "NOT_LOGGED_IN") {
            status.textContent = "Please sign into InstaHMS in another tab first.";
          } else {
            const detail = res && res.detail ? `: ${res.detail}` : "";
            status.textContent = `HMS lookup failed (${(res && res.error) || "unknown"}${detail}).`;
          }
          status.style.color = "#b91c1c";
          return;
        }

        const doc = new DOMParser().parseFromString(res.html, "text/html");
        if (parser.isInstaHmsLoginPage(doc)) {
          status.textContent = "Please sign into InstaHMS in another tab first.";
          status.style.color = "#b91c1c";
          return;
        }

        const patient = parser.parseInstaHmsPatient(doc);
        if (!patient) {
          status.textContent = "No patient found for this MRN in InstaHMS.";
          status.style.color = "#b91c1c";
          return;
        }

        postPrefillToPage(patient);
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

    const mrnRow = document.getElementById("mrn-input-row");
    if (mrnRow) {
      mrnRow.appendChild(btn);
      mrnRow.insertAdjacentElement("afterend", status);
    } else {
      mrnInput.insertAdjacentElement("afterend", btn);
      btn.insertAdjacentElement("afterend", status);
    }

    // Once #mrn is mounted, the React listener is also mounted — safe to replay Push payload
    consumePendingPushPrefill();
  }

  // Next.js NewCasePage waits for /api/departments before rendering #mrn
  const observer = new MutationObserver(() => {
    attachFetchButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  attachFetchButton();
})();
