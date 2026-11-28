"use strict";

const extApi = globalThis.browser ?? globalThis.chrome;

const INSTAHMS_EMR_URL =
  "http://192.168.10.12/instahms/emr/EMRMainDisplay.do?_method=list&mr_no=";

const BASE_ORIGIN = "https://192.168.11.143";
const PACS_LOGIN_URL = "http://192.168.10.222/PACSLogin";
const TARGET_URLS = {
  clarity: `${BASE_ORIGIN}/cases/new?fromHms=1`,
  irlog: `${BASE_ORIGIN}/irlog/worklist/?fromHms=1`,
};
let inMemoryPrefill = null;
let inMemoryPacsRequest = null;
let inMemoryUnlockedCreds = null;
let pendingAfterUnlock = null;
const autoLoginArmed = {
  clarity: 0,
  irlog: 0,
  instahms: 0,
  pacs: 0,
};

function armAutoLogin(target) {
  if (!Object.prototype.hasOwnProperty.call(autoLoginArmed, target)) return;
  autoLoginArmed[target] = Date.now() + 45000;
}

async function getUnlockedCreds() {
  if (inMemoryUnlockedCreds) return inMemoryUnlockedCreds;
  try {
    if (extApi.storage && extApi.storage.session) {
      const data = await extApi.storage.session.get("unlockedCreds");
      if (data && data.unlockedCreds) {
        inMemoryUnlockedCreds = data.unlockedCreds;
        return inMemoryUnlockedCreds;
      }
    }
  } catch (_err) {
    // Ignore
  }
  return null;
}

async function setUnlockedCreds(creds) {
  inMemoryUnlockedCreds = creds || null;
  try {
    if (extApi.storage && extApi.storage.session) {
      if (creds) {
        await extApi.storage.session.set({ unlockedCreds: creds });
      } else {
        await extApi.storage.session.remove("unlockedCreds");
      }
    }
  } catch (_err) {
    // Ignore
  }
}

async function promptUnlockIfLocked(deferredAction) {
  const creds = await getUnlockedCreds();
  if (creds) return true;
  const { encryptedVault } = await extApi.storage.local.get("encryptedVault");
  if (!encryptedVault) return false;
  if (deferredAction) {
    pendingAfterUnlock = deferredAction;
  }
  await extApi.tabs.create({ url: extApi.runtime.getURL("unlock.html") });
  return "PROMPTED";
}

function flashBadge(tabId, text, color) {
  if (!extApi.action || !tabId) return;
  extApi.action.setBadgeBackgroundColor({ tabId, color });
  extApi.action.setBadgeText({ tabId, text });
  setTimeout(() => {
    extApi.action.setBadgeText({ tabId, text: "" });
  }, 2500);
}

async function getTargetPrefs() {
  try {
    const stored = await extApi.storage.local.get({
      enableClarity: true,
      enableIrlog: false,
    });
    return {
      enableClarity: Boolean(stored.enableClarity),
      enableIrlog: Boolean(stored.enableIrlog),
    };
  } catch (_err) {
    return { enableClarity: true, enableIrlog: false };
  }
}

async function syncActionPopup() {
  if (!extApi.action || !extApi.action.setPopup) return;
  const prefs = await getTargetPrefs();
  const popup = prefs.enableClarity && prefs.enableIrlog ? "popup.html" : "";
  await extApi.action.setPopup({ popup });
}

async function openTargetWithPrefill(target, payload) {
  const targetUrl = TARGET_URLS[target] || TARGET_URLS.clarity;
  armAutoLogin(target === "irlog" ? "irlog" : "clarity");
  inMemoryPrefill = payload;
  try {
    if (extApi.storage && extApi.storage.session) {
      await extApi.storage.session.set({ pendingHmsPrefill: payload });
    }
  } catch (_err) {
    // inMemoryPrefill remains available as fallback
  }
  await extApi.tabs.create({ url: targetUrl });
}

async function openPacsWithMrn(mrn, suid) {
  const cleanMrn = String(mrn || "").trim();
  const cleanSuid = String(suid || "").trim();
  if (!cleanMrn) return false;

  // If a PACS tab (other than PACSLogin) is already open, focus it and trigger search directly
  try {
    const pacsTabs = await extApi.tabs.query({
      url: "http://192.168.10.222/*",
    });
    for (const pacsTab of pacsTabs) {
      if (!pacsTab.id || /PACSLogin/i.test(pacsTab.url || "")) continue;
      try {
        const res = await extApi.tabs.sendMessage(pacsTab.id, {
          type: "RUN_PACS_SEARCH",
          mrn: cleanMrn,
          suid: cleanSuid,
        });
        if (res && res.ok) {
          await extApi.tabs.update(pacsTab.id, { active: true });
          return true;
        }
      } catch (_err) {
        // Content script wasn't injected yet (e.g. tab opened before extension load) — inject & retry
        try {
          if (extApi.scripting && extApi.scripting.executeScript) {
            await extApi.scripting.executeScript({
              target: { tabId: pacsTab.id, allFrames: true },
              files: ["pacs-content.js"],
            });
            const retryRes = await extApi.tabs.sendMessage(pacsTab.id, {
              type: "RUN_PACS_SEARCH",
              mrn: cleanMrn,
              suid: cleanSuid,
            });
            if (retryRes && retryRes.ok) {
              await extApi.tabs.update(pacsTab.id, { active: true });
              return true;
            }
          }
        } catch (_injectErr) {
          // Fall through to opening PACSLogin
        }
      }
    }
  } catch (_err) {
    // Ignore tabs.query errors
  }

  // Never open /PACSStudyList without ?prm= (triggers ForgedError); open PACSLogin instead
  const unlockState = await promptUnlockIfLocked({
    type: "OPEN_PACS_WITH_MRN",
    mrn: cleanMrn,
    suid: cleanSuid,
  });
  if (unlockState === "PROMPTED") {
    return true;
  }

  armAutoLogin("pacs");
  const pacsReq = { mrn: cleanMrn, suid: cleanSuid };
  inMemoryPacsRequest = pacsReq;
  try {
    if (extApi.storage && extApi.storage.session) {
      await extApi.storage.session.set({ pendingPacsRequest: pacsReq });
    }
  } catch (_err) {
    // inMemoryPacsRequest remains available as fallback
  }

  await extApi.tabs.create({ url: PACS_LOGIN_URL });
  return true;
}

async function pushFromTab(tabId, target) {
  const res = await extApi.tabs.sendMessage(tabId, {
    type: "SCRAPE_PATIENT",
  });
  if (!res || !res.ok || !res.patient) {
    return false;
  }
  if (target === "pacs") {
    return openPacsWithMrn(res.patient.mrn);
  }
  await openTargetWithPrefill(target, res.patient);
  return true;
}

if (extApi.runtime.onInstalled) {
  extApi.runtime.onInstalled.addListener(() => {
    syncActionPopup();
  });
}
if (extApi.runtime.onStartup) {
  extApi.runtime.onStartup.addListener(() => {
    syncActionPopup();
  });
}
syncActionPopup();

// Direct toolbar click (fires when popup is "" — i.e., 0 or 1 target enabled)
if (extApi.action && extApi.action.onClicked) {
  extApi.action.onClicked.addListener(async (tab) => {
    if (!tab || !tab.id) return;

    const prefs = await getTargetPrefs();
    const target = prefs.enableClarity
      ? "clarity"
      : prefs.enableIrlog
        ? "irlog"
        : null;

    if (!target) {
      extApi.runtime.openOptionsPage();
      return;
    }

    try {
      const pushed = await pushFromTab(tab.id, target);
      flashBadge(tab.id, pushed ? "OK" : "!", pushed ? "#0f766e" : "#b91c1c");
    } catch (_err) {
      // Tab is not an InstaHMS EMR page or content script isn't loaded
      flashBadge(tab.id, "!", "#b91c1c");
    }
  });
}

extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "GET_VAULT_STATUS") {
    getUnlockedCreds()
      .then((creds) =>
        sendResponse({ unlocked: Boolean(creds), creds: creds || null })
      )
      .catch(() => sendResponse({ unlocked: false, creds: null }));
    return true;
  }

  if (message.type === "SET_UNLOCKED_CREDS") {
    setUnlockedCreds(message.creds)
      .then(async () => {
        const deferred = pendingAfterUnlock;
        pendingAfterUnlock = null;
        if (deferred && deferred.type === "OPEN_PACS_WITH_MRN" && deferred.mrn) {
          await openPacsWithMrn(deferred.mrn, deferred.suid);
        }
        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "LOCK_VAULT") {
    setUnlockedCreds(null)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "CONSUME_AUTO_LOGIN") {
    (async () => {
      const target = message.target;
      const armedUntil = autoLoginArmed[target] || 0;
      // Consume immediately so at most 1 auto-login attempt occurs per trigger
      autoLoginArmed[target] = 0;

      if (!armedUntil || Date.now() > armedUntil) {
        sendResponse({ ok: false, reason: "NOT_ARMED" });
        return;
      }

      const creds = await getUnlockedCreds();
      const targetCreds = creds && creds[target];
      if (!targetCreds || !targetCreds.username || !targetCreds.password) {
        sendResponse({ ok: false, reason: "NO_CREDS" });
        return;
      }

      sendResponse({ ok: true, creds: targetCreds });
    })();
    return true;
  }

  if (message.type === "SYNC_ACTION_POPUP") {
    syncActionPopup()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "PUSH_ACTIVE_TAB_TO") {
    (async () => {
      try {
        const tabs = await extApi.tabs.query({
          active: true,
          currentWindow: true,
        });
        const activeTab = tabs && tabs[0];
        if (!activeTab || !activeTab.id) {
          sendResponse({ ok: false, error: "NO_ACTIVE_TAB" });
          return;
        }
        const pushed = await pushFromTab(activeTab.id, message.target);
        if (!pushed) {
          flashBadge(activeTab.id, "!", "#b91c1c");
          sendResponse({ ok: false, error: "NO_PATIENT" });
          return;
        }
        flashBadge(activeTab.id, "OK", "#0f766e");
        sendResponse({ ok: true });
      } catch (_err) {
        sendResponse({ ok: false, error: "NO_PATIENT" });
      }
    })();
    return true;
  }

  if (message.type === "OPEN_PACS_BY_MRN") {
    openPacsWithMrn(message.mrn, message.suid)
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "CONSUME_PENDING_PACS_MRN") {
    (async () => {
      let req = inMemoryPacsRequest;
      inMemoryPacsRequest = null;

      try {
        if (extApi.storage && extApi.storage.session) {
          const data = await extApi.storage.session.get("pendingPacsRequest");
          if (data && data.pendingPacsRequest) {
            req = data.pendingPacsRequest;
          }
          await extApi.storage.session.remove("pendingPacsRequest");
        }
      } catch (_err) {
        // Ignore storage errors if inMemoryPacsRequest already captured it
      }

      sendResponse({
        ok: Boolean(req && req.mrn),
        mrn: req ? req.mrn : null,
        suid: req ? req.suid : null,
      });
    })();
    return true;
  }

  if (message.type === "CONSUME_PENDING_PREFILL") {
    (async () => {
      let payload = inMemoryPrefill;
      inMemoryPrefill = null;

      try {
        if (extApi.storage && extApi.storage.session) {
          const data = await extApi.storage.session.get("pendingHmsPrefill");
          if (data && data.pendingHmsPrefill) {
            payload = data.pendingHmsPrefill;
          }
          await extApi.storage.session.remove("pendingHmsPrefill");
        }
      } catch (_err) {
        // Ignore storage errors if inMemoryPrefill already captured it
      }

      sendResponse({ ok: Boolean(payload), payload: payload || null });
    })();

    return true;
  }

  if (message.type === "FETCH_PATIENT_BY_MRN") {
    const rawMrn = String(message.mrn || "").trim();
    if (!rawMrn) {
      sendResponse({ ok: false, error: "MISSING_MRN" });
      return false;
    }

    const mrn = /^\d{1,8}$/.test(rawMrn)
      ? `SN${rawMrn.padStart(8, "0")}`
      : /^sn\d{1,8}$/i.test(rawMrn)
        ? `SN${rawMrn.slice(2).padStart(8, "0")}`
        : rawMrn;

    (async () => {
      try {
        if (extApi.permissions && extApi.permissions.contains) {
          const hasPerm = await extApi.permissions.contains({
            origins: ["http://192.168.10.12/instahms/*"],
          });
          if (!hasPerm) {
            sendResponse({
              ok: false,
              error: "PERMISSION_DENIED",
              detail: "Enable 192.168.10.12 in about:addons -> Permissions",
            });
            return;
          }
        }

        const res = await fetch(INSTAHMS_EMR_URL + encodeURIComponent(mrn), {
          method: "GET",
          credentials: "include",
        });

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
      } catch (err) {
        // Fallback: if background fetch is blocked (e.g. HTTPS-Only Mode), ask an open InstaHMS tab
        try {
          const hmsTabs = await extApi.tabs.query({
            url: "http://192.168.10.12/instahms/*",
          });
          for (const hmsTab of hmsTabs) {
            if (!hmsTab.id) continue;
            const tabRes = await extApi.tabs.sendMessage(hmsTab.id, {
              type: "FETCH_PATIENT_SAME_ORIGIN",
              mrn,
            });
            if (tabRes) {
              sendResponse(tabRes);
              return;
            }
          }
        } catch (_fallbackErr) {
          // Ignore fallback errors and report original network error
        }

        sendResponse({
          ok: false,
          error: "NETWORK_ERROR",
          detail: `${err ? String(err.message || err) : "Unknown error"} (check HTTPS-Only Mode or keep an InstaHMS tab open)`,
        });
      }
    })();

    return true; // Keep message channel open for async sendResponse
  }

  return false;
});
