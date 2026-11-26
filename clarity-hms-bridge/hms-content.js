"use strict";

(function () {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const parser = globalThis.ClarityHmsParser;
  if (!parser) return;

  extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "SCRAPE_PATIENT") {
      // Only respond from the frame that actually contains #patientDetailsTab
      if (!document.querySelector("#patientDetailsTab")) {
        return false;
      }

      const patient = parser.parseInstaHmsPatient(document);
      sendResponse({
        ok: Boolean(patient),
        patient,
      });
      return false;
    }

    if (message.type === "FETCH_PATIENT_SAME_ORIGIN") {
      // Run in top frame only so we don't duplicate fetches across frames
      if (window !== window.top) return false;

      const mrn = String(message.mrn || "").trim();
      fetch(`/instahms/emr/EMRMainDisplay.do?_method=list&mr_no=${encodeURIComponent(mrn)}`, {
        method: "GET",
        credentials: "include",
      })
        .then(async (res) => {
          if (res.redirected && /login/i.test(res.url)) {
            sendResponse({ ok: false, error: "NOT_LOGGED_IN" });
            return;
          }
          if (!res.ok) {
            sendResponse({ ok: false, error: `HTTP_${res.status}` });
            return;
          }
          const html = await res.text();
          sendResponse({ ok: true, html });
        })
        .catch((err) => {
          sendResponse({
            ok: false,
            error: "NETWORK_ERROR",
            detail: err ? String(err.message || err) : "Same-origin fetch failed",
          });
        });

      return true;
    }

    return false;
  });
})();
