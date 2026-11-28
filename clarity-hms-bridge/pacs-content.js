"use strict";

(function () {
  const extApi = globalThis.browser ?? globalThis.chrome;
  const PENDING_SUID_KEY = "clarityPendingPacsSuid";
  let openedSuidInThisPage = false;

  function toPacsMrn(rawMrn) {
    const trimmed = String(rawMrn || "").trim();
    if (!trimmed) return "";
    // Medsynapse expects the numeric MRN without the "SN00" prefix (e.g. SN00918543 -> 918543)
    return trimmed.replace(/^sn0*/i, "");
  }

  function tryOpenStudyBySuid(suid) {
    if (!suid || openedSuidInThisPage) return false;
    const rows = document.querySelectorAll("#dataTable2 tbody tr");
    for (const row of rows) {
      const siCell = row.querySelector('td[tag="SI"]');
      if (!siCell) continue;
      if ((siCell.textContent || "").trim() === suid) {
        openedSuidInThisPage = true;
        const dispatchOpen = () => {
          row.scrollIntoView({ block: "center" });
          const target =
            row.querySelector("td:not([style*='display: none']):not([style*='display:none'])") ||
            row;

          // Wait briefly for Medsynapse jQuery row handlers to bind, then click + dblclick
          setTimeout(() => {
            target.dispatchEvent(
              new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window,
              })
            );
            setTimeout(() => {
              target.dispatchEvent(
                new MouseEvent("dblclick", {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                })
              );
            }, 200);
          }, 400);
        };

        if (document.readyState === "complete") {
          dispatchOpen();
        } else {
          window.addEventListener("load", dispatchOpen, { once: true });
        }
        return true;
      }
    }
    return false;
  }

  function runPacsSearch(rawMrn, suid) {
    const pacsMrn = toPacsMrn(rawMrn);
    if (!pacsMrn) return false;

    const patientInput = document.getElementById("PatientID");
    const findBtn = document.getElementById("cmdfind");
    if (!patientInput || !findBtn) return false;

    if (suid) {
      try {
        window.sessionStorage.setItem(PENDING_SUID_KEY, suid);
      } catch (_err) {
        // Ignore storage errors
      }
    } else {
      try {
        window.sessionStorage.removeItem(PENDING_SUID_KEY);
      } catch (_err) {
        // Ignore
      }
    }

    // Clear placeholder class used by Medsynapse's legacy jQuery plugin
    patientInput.classList.remove("placeholder");
    patientInput.value = pacsMrn;
    patientInput.dispatchEvent(new Event("input", { bubbles: true }));
    patientInput.dispatchEvent(new Event("change", { bubbles: true }));

    // Switch Time_Frame from "Last 3 Days" to "All"
    const timeSelect = document.getElementById("Time_Frame");
    if (timeSelect) {
      timeSelect.value = "All";
      timeSelect.dispatchEvent(new Event("change", { bubbles: true }));

      // Sync bootstrap-select wrapper UI if present
      const bsDropdown = timeSelect.nextElementSibling;
      if (bsDropdown && bsDropdown.classList.contains("bootstrap-select")) {
        const allLink = bsDropdown.querySelector('ul.dropdown-menu li[rel="1"] a');
        if (allLink) {
          allLink.click();
        }
      }
    }

    // Trigger Find (submits POST form and reloads page with filtered rows)
    setTimeout(() => {
      findBtn.click();
    }, 50);

    return true;
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_err) {
        // Fall through to execCommand fallback on HTTP origins
      }
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (_err) {
      copied = false;
    }
    ta.remove();
    return copied;
  }

  function attachCopyStudyLinkButtons() {
    const leftRows = document.querySelectorAll("#dataTable1 tbody tr");
    const rightRows = document.querySelectorAll("#dataTable2 tbody tr");
    if (!leftRows.length || !rightRows.length) return;

    const count = Math.min(leftRows.length, rightRows.length);
    for (let i = 0; i < count; i++) {
      const leftRow = leftRows[i];
      const rightRow = rightRows[i];
      if (!leftRow || leftRow.dataset.pacsLinkAttached === "true") continue;

      const piCell = rightRow.querySelector('td[tag="PI"]');
      const siCell = rightRow.querySelector('td[tag="SI"]');
      const mrn = piCell ? (piCell.textContent || "").trim() : "";
      const suid = siCell ? (siCell.textContent || "").trim() : "";
      if (!mrn || !suid) continue;

      const firstCell = leftRow.children[0];
      if (!firstCell) continue;

      leftRow.dataset.pacsLinkAttached = "true";

      const linkIconSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
      const checkIconSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><polyline points="20 6 9 17 4 12"/></svg>';

      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = linkIconSvg;
      btn.title = "Copy direct study link for ClarityMDT";
      btn.style.cssText =
        "margin-right:4px;padding:2px 4px;border:none;border-radius:3px;background:#0f766e;color:#ffffff;cursor:pointer;vertical-align:middle;display:inline-flex;align-items:center;justify-content:center;";

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = `http://192.168.10.222/PACSStudyList#mrn=${encodeURIComponent(
          mrn
        )}&suid=${encodeURIComponent(suid)}`;

        const ok = await copyTextToClipboard(url);
        if (ok) {
          btn.innerHTML = checkIconSvg;
          btn.style.background = "#16a34a";
          setTimeout(() => {
            btn.innerHTML = linkIconSvg;
            btn.style.background = "#0f766e";
          }, 1500);
          return;
        }

        // Custom fallback dialog with an explicit Copy button
        const overlay = document.createElement("div");
        overlay.style.cssText =
          "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:999999;display:flex;align-items:center;justify-content:center;";
        const box = document.createElement("div");
        box.style.cssText =
          "background:#ffffff;color:#0f172a;padding:14px;border-radius:8px;width:360px;max-width:90vw;font-family:system-ui,sans-serif;box-shadow:0 10px 25px rgba(0,0,0,0.25);";
        const input = document.createElement("input");
        input.type = "text";
        input.readOnly = true;
        input.value = url;
        input.style.cssText =
          "width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;margin-bottom:10px;";
        const row = document.createElement("div");
        row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.textContent = "Copy";
        copyBtn.style.cssText =
          "background:#0f766e;color:#ffffff;border:none;border-radius:4px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;";
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "Cancel";
        cancelBtn.style.cssText =
          "background:#e2e8f0;color:#0f172a;border:none;border-radius:4px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;";

        copyBtn.addEventListener("click", async () => {
          input.select();
          await copyTextToClipboard(url);
          overlay.remove();
          btn.innerHTML = checkIconSvg;
          btn.style.background = "#16a34a";
          setTimeout(() => {
            btn.innerHTML = linkIconSvg;
            btn.style.background = "#0f766e";
          }, 1500);
        });
        cancelBtn.addEventListener("click", () => overlay.remove());

        row.appendChild(cancelBtn);
        row.appendChild(copyBtn);
        box.appendChild(input);
        box.appendChild(row);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        input.select();
      });

      btn.addEventListener("dblclick", (e) => {
        e.stopPropagation();
      });

      firstCell.insertBefore(btn, firstCell.firstChild);
    }
  }

  function checkPendingSuidAfterReload() {
    let pendingSuid = "";
    try {
      pendingSuid = window.sessionStorage.getItem(PENDING_SUID_KEY) || "";
    } catch (_err) {
      return;
    }
    if (!pendingSuid) return;

    if (tryOpenStudyBySuid(pendingSuid)) {
      try {
        window.sessionStorage.removeItem(PENDING_SUID_KEY);
      } catch (_err) {
        // Ignore
      }
    }
  }

  extApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "RUN_PACS_SEARCH") return false;

    // Only respond from the frame that actually contains #PatientID and #cmdfind
    if (!document.getElementById("PatientID") || !document.getElementById("cmdfind")) {
      return false;
    }

    const ok = runPacsSearch(message.mrn, message.suid);
    sendResponse({ ok });
    return false;
  });

  async function consumePendingPacsSearch() {
    // Only consume from the frame that actually contains #PatientID and #cmdfind
    if (!document.getElementById("PatientID") || !document.getElementById("cmdfind")) {
      return;
    }

    try {
      const res = await extApi.runtime.sendMessage({
        type: "CONSUME_PENDING_PACS_MRN",
      });
      if (res && res.ok && res.mrn) {
        runPacsSearch(res.mrn, res.suid);
        return;
      }
    } catch (_err) {
      // Ignore if no pending PACS MRN
    }

    checkPendingSuidAfterReload();
  }

  attachCopyStudyLinkButtons();
  consumePendingPacsSearch();

  const observer = new MutationObserver(() => {
    attachCopyStudyLinkButtons();
    checkPendingSuidAfterReload();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
