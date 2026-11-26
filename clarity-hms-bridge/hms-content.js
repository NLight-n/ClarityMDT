"use strict";

(function () {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const parser = globalThis.ClarityHmsParser;
  if (!parser) return;

  extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "SCRAPE_PATIENT") return false;

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
  });
})();
