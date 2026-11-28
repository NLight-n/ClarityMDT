"use strict";

(function () {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const vaultLib = globalThis.ClarityCryptoVault;

  const form = document.getElementById("unlockForm");
  const pinInput = document.getElementById("pinInput");
  const statusEl = document.getElementById("status");
  const openOptionsBtn = document.getElementById("openOptionsBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = pinInput.value.trim();
    if (!pin) return;

    const { encryptedVault } = await extApi.storage.local.get("encryptedVault");
    if (!encryptedVault) {
      statusEl.textContent = "No saved credentials found.";
      return;
    }

    try {
      const creds = await vaultLib.decryptVault(pin, encryptedVault);
      await extApi.runtime.sendMessage({
        type: "SET_UNLOCKED_CREDS",
        creds,
      });
      window.close();
    } catch (_err) {
      statusEl.textContent = "Incorrect PIN.";
      pinInput.select();
    }
  });

  openOptionsBtn.addEventListener("click", () => {
    extApi.runtime.openOptionsPage();
    window.close();
  });
})();
