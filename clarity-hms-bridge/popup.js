"use strict";

(function () {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const sendClarityBtn = document.getElementById("sendClarity");
  const sendIrlogBtn = document.getElementById("sendIrlog");
  const openOptionsBtn = document.getElementById("openOptions");
  const statusEl = document.getElementById("status");

  async function pushTo(target) {
    sendClarityBtn.disabled = true;
    sendIrlogBtn.disabled = true;
    statusEl.textContent = "";

    try {
      const res = await extApi.runtime.sendMessage({
        type: "PUSH_ACTIVE_TAB_TO",
        target,
      });

      if (res && res.ok) {
        window.close();
        return;
      }

      statusEl.textContent =
        (res && res.error === "NO_PATIENT")
          ? "Open an HMS patient page first."
          : "Could not read HMS page.";
    } catch (_err) {
      statusEl.textContent = "Open an HMS patient page first.";
    } finally {
      sendClarityBtn.disabled = false;
      sendIrlogBtn.disabled = false;
    }
  }

  sendClarityBtn.addEventListener("click", () => pushTo("clarity"));
  sendIrlogBtn.addEventListener("click", () => pushTo("irlog"));
  openOptionsBtn.addEventListener("click", () => {
    extApi.runtime.openOptionsPage();
    window.close();
  });
})();
