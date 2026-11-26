"use strict";

const extApi = globalThis.browser ?? globalThis.chrome;

const INSTAHMS_EMR_URL =
  "http://192.168.10.12/instahms/emr/EMRMainDisplay.do?_method=list&mr_no=";

const CLARITY_BASE_URL = "https://192.168.11.143";

function flashBadge(tabId, text, color) {
  if (!extApi.action || !tabId) return;
  extApi.action.setBadgeBackgroundColor({ tabId, color });
  extApi.action.setBadgeText({ tabId, text });
  setTimeout(() => {
    extApi.action.setBadgeText({ tabId, text: "" });
  }, 2500);
}

async function openClarityWithPrefill(payload) {
  await extApi.storage.session.set({ pendingHmsPrefill: payload });
  await extApi.tabs.create({
    url: `${CLARITY_BASE_URL}/cases/new?fromHms=1`,
  });
}

// Toolbar icon click: scrape patient from the active InstaHMS tab and open ClarityMDT
if (extApi.action && extApi.action.onClicked) {
  extApi.action.onClicked.addListener(async (tab) => {
    if (!tab || !tab.id) return;

    try {
      const res = await extApi.tabs.sendMessage(tab.id, {
        type: "SCRAPE_PATIENT",
      });

      if (!res || !res.ok || !res.patient) {
        flashBadge(tab.id, "!", "#b91c1c");
        return;
      }

      await openClarityWithPrefill(res.patient);
      flashBadge(tab.id, "OK", "#0f766e");
    } catch (_err) {
      // Tab is not an InstaHMS EMR page or content script isn't loaded
      flashBadge(tab.id, "!", "#b91c1c");
    }
  });
}

extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "FETCH_PATIENT_BY_MRN") {
    const mrn = String(message.mrn || "").trim();
    if (!mrn) {
      sendResponse({ ok: false, error: "MISSING_MRN" });
      return false;
    }

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
        sendResponse({
          ok: false,
          error: "NETWORK_ERROR",
          detail: err ? String(err.message || err) : "Unknown error",
        });
      }
    })();

    return true; // Keep message channel open for async sendResponse
  }

  return false;
});
