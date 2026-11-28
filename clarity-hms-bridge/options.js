"use strict";

(function () {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const vaultLib = globalThis.ClarityCryptoVault;

  const ORIGINS = {
    clarity: ["https://192.168.11.143/*"],
    irlog: ["https://192.168.11.143/*"],
    instahms: ["http://192.168.10.12/instahms/*"],
    pacs: ["http://192.168.10.222/*"],
  };

  const els = {
    enableClarity: document.getElementById("enableClarity"),
    enableIrlog: document.getElementById("enableIrlog"),
    permClarity: document.getElementById("permClarity"),
    permIrlog: document.getElementById("permIrlog"),
    permInstahms: document.getElementById("permInstahms"),
    permPacs: document.getElementById("permPacs"),

    vaultStateText: document.getElementById("vaultStateText"),
    lockNowBtn: document.getElementById("lockNowBtn"),
    setupPinBox: document.getElementById("setupPinBox"),
    unlockPinBox: document.getElementById("unlockPinBox"),
    newPin: document.getElementById("newPin"),
    confirmPin: document.getElementById("confirmPin"),
    setPinBtn: document.getElementById("setPinBtn"),
    unlockPin: document.getElementById("unlockPin"),
    unlockBtn: document.getElementById("unlockBtn"),
    resetVaultBtn: document.getElementById("resetVaultBtn"),
    pinStatus: document.getElementById("pinStatus"),

    clarityUser: document.getElementById("clarityUser"),
    clarityPass: document.getElementById("clarityPass"),
    irlogUser: document.getElementById("irlogUser"),
    irlogPass: document.getElementById("irlogPass"),
    hmsHospital: document.getElementById("hmsHospital"),
    hmsUser: document.getElementById("hmsUser"),
    hmsPass: document.getElementById("hmsPass"),
    pacsUser: document.getElementById("pacsUser"),
    pacsPass: document.getElementById("pacsPass"),

    saveCredsBtn: document.getElementById("saveCredsBtn"),
    saveStatus: document.getElementById("saveStatus"),
  };

  const credInputs = [
    els.clarityUser,
    els.clarityPass,
    els.irlogUser,
    els.irlogPass,
    els.hmsHospital,
    els.hmsUser,
    els.hmsPass,
    els.pacsUser,
    els.pacsPass,
  ];

  let activePin = null;

  function setStatus(el, msg, isError) {
    el.textContent = msg || "";
    el.className = isError ? "status error" : "status";
  }

  function setCredsEnabled(enabled) {
    for (const input of credInputs) {
      input.disabled = !enabled;
    }
    els.saveCredsBtn.disabled = !enabled;
  }

  function populateCreds(creds) {
    const c = creds || {};
    els.clarityUser.value = (c.clarity && c.clarity.username) || "";
    els.clarityPass.value = (c.clarity && c.clarity.password) || "";
    els.irlogUser.value = (c.irlog && c.irlog.username) || "";
    els.irlogPass.value = (c.irlog && c.irlog.password) || "";
    els.hmsHospital.value = (c.instahms && c.instahms.hospital) || "";
    els.hmsUser.value = (c.instahms && c.instahms.username) || "";
    els.hmsPass.value = (c.instahms && c.instahms.password) || "";
    els.pacsUser.value = (c.pacs && c.pacs.username) || "";
    els.pacsPass.value = (c.pacs && c.pacs.password) || "";
  }

  function collectCreds() {
    return {
      clarity: {
        username: els.clarityUser.value.trim(),
        password: els.clarityPass.value,
      },
      irlog: {
        username: els.irlogUser.value.trim(),
        password: els.irlogPass.value,
      },
      instahms: {
        hospital: els.hmsHospital.value.trim(),
        username: els.hmsUser.value.trim(),
        password: els.hmsPass.value,
      },
      pacs: {
        username: els.pacsUser.value.trim(),
        password: els.pacsPass.value,
      },
    };
  }

  async function refreshPermissions() {
    if (!extApi.permissions || !extApi.permissions.contains) return;
    const [hasClarity, hasHms, hasPacs] = await Promise.all([
      extApi.permissions.contains({ origins: ORIGINS.clarity }),
      extApi.permissions.contains({ origins: ORIGINS.instahms }),
      extApi.permissions.contains({ origins: ORIGINS.pacs }),
    ]);
    els.permClarity.checked = hasClarity;
    els.permIrlog.checked = hasClarity;
    els.permInstahms.checked = hasHms;
    els.permPacs.checked = hasPacs;
  }

  async function togglePermission(checkbox, origins) {
    if (!extApi.permissions) return;
    if (checkbox.checked) {
      const granted = await extApi.permissions.request({ origins });
      checkbox.checked = granted;
    } else {
      await extApi.permissions.remove({ origins });
      checkbox.checked = false;
    }
    await refreshPermissions();
  }

  async function refreshVaultUI() {
    const localData = await extApi.storage.local.get({
      enableClarity: true,
      enableIrlog: false,
      encryptedVault: null,
    });

    els.enableClarity.checked = Boolean(localData.enableClarity);
    els.enableIrlog.checked = Boolean(localData.enableIrlog);

    const hasVault = Boolean(localData.encryptedVault);
    const sessionState = await extApi.runtime.sendMessage({
      type: "GET_VAULT_STATUS",
    });

    if (!hasVault && !activePin) {
      els.vaultStateText.textContent =
        "Set a PIN (min 4 alphanumeric characters) before entering credentials.";
      els.setupPinBox.classList.remove("hidden");
      els.unlockPinBox.classList.add("hidden");
      els.lockNowBtn.classList.add("hidden");
      setCredsEnabled(false);
      populateCreds(null);
      return;
    }

    if (sessionState && sessionState.unlocked && activePin) {
      els.vaultStateText.textContent = "Vault unlocked for this browser session.";
      els.setupPinBox.classList.add("hidden");
      els.unlockPinBox.classList.add("hidden");
      els.lockNowBtn.classList.remove("hidden");
      setCredsEnabled(true);
      populateCreds(sessionState.creds);
      return;
    }

    // Vault exists (or was unlocked in another tab without activePin here) -> ask PIN to edit
    els.vaultStateText.textContent =
      sessionState && sessionState.unlocked
        ? "Unlocked in session. Enter PIN to view or edit credentials."
        : "Locked. Enter your PIN to unlock saved credentials.";
    els.setupPinBox.classList.add("hidden");
    els.unlockPinBox.classList.remove("hidden");
    els.lockNowBtn.classList.toggle("hidden", !(sessionState && sessionState.unlocked));
    setCredsEnabled(false);
    populateCreds(null);
  }

  async function saveTargetToggles() {
    await extApi.storage.local.set({
      enableClarity: els.enableClarity.checked,
      enableIrlog: els.enableIrlog.checked,
    });
    await extApi.runtime.sendMessage({ type: "SYNC_ACTION_POPUP" });
  }

  els.enableClarity.addEventListener("change", saveTargetToggles);
  els.enableIrlog.addEventListener("change", saveTargetToggles);

  els.permClarity.addEventListener("change", () =>
    togglePermission(els.permClarity, ORIGINS.clarity)
  );
  els.permIrlog.addEventListener("change", () =>
    togglePermission(els.permIrlog, ORIGINS.irlog)
  );
  els.permInstahms.addEventListener("change", () =>
    togglePermission(els.permInstahms, ORIGINS.instahms)
  );
  els.permPacs.addEventListener("change", () =>
    togglePermission(els.permPacs, ORIGINS.pacs)
  );

  els.setPinBtn.addEventListener("click", async () => {
    const pin = els.newPin.value.trim();
    const confirm = els.confirmPin.value.trim();
    if (!/^[a-zA-Z0-9]{4,}$/.test(pin)) {
      setStatus(els.pinStatus, "PIN must be at least 4 alphanumeric characters.", true);
      return;
    }
    if (pin !== confirm) {
      setStatus(els.pinStatus, "PINs do not match.", true);
      return;
    }

    activePin = pin;
    els.newPin.value = "";
    els.confirmPin.value = "";

    const emptyCreds = collectCreds();
    const encryptedVault = await vaultLib.encryptVault(activePin, emptyCreds);
    await extApi.storage.local.set({ encryptedVault });
    await extApi.runtime.sendMessage({
      type: "SET_UNLOCKED_CREDS",
      creds: emptyCreds,
    });

    setStatus(els.pinStatus, "PIN set. You can now enter and save credentials.", false);
    await refreshVaultUI();
  });

  els.unlockBtn.addEventListener("click", async () => {
    const pin = els.unlockPin.value.trim();
    if (!pin) return;

    const { encryptedVault } = await extApi.storage.local.get("encryptedVault");
    try {
      const creds = await vaultLib.decryptVault(pin, encryptedVault);
      activePin = pin;
      els.unlockPin.value = "";
      await extApi.runtime.sendMessage({
        type: "SET_UNLOCKED_CREDS",
        creds,
      });
      setStatus(els.pinStatus, "Unlocked.", false);
      await refreshVaultUI();
    } catch (_err) {
      setStatus(els.pinStatus, "Incorrect PIN.", true);
    }
  });

  els.lockNowBtn.addEventListener("click", async () => {
    activePin = null;
    await extApi.runtime.sendMessage({ type: "LOCK_VAULT" });
    setStatus(els.pinStatus, "Vault locked.", false);
    await refreshVaultUI();
  });

  els.resetVaultBtn.addEventListener("click", async () => {
    if (!window.confirm("Reset and erase all saved credentials and PIN?")) return;
    activePin = null;
    await extApi.storage.local.remove("encryptedVault");
    await extApi.runtime.sendMessage({ type: "LOCK_VAULT" });
    setStatus(els.pinStatus, "Saved credentials cleared. You can set a new PIN.", false);
    await refreshVaultUI();
  });

  els.saveCredsBtn.addEventListener("click", async () => {
    if (!activePin) {
      setStatus(els.saveStatus, "Unlock with your PIN first.", true);
      return;
    }
    const creds = collectCreds();
    const encryptedVault = await vaultLib.encryptVault(activePin, creds);
    await extApi.storage.local.set({ encryptedVault });
    await extApi.runtime.sendMessage({
      type: "SET_UNLOCKED_CREDS",
      creds,
    });
    setStatus(els.saveStatus, "Credentials encrypted & saved.", false);
    setTimeout(() => setStatus(els.saveStatus, "", false), 2000);
  });

  refreshPermissions();
  refreshVaultUI();
})();
