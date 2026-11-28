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

  function attachHmsPacsButton() {
    const table = document.querySelector("#patientDetailsTab");
    if (!table) return;

    const labels = table.querySelectorAll("td.formlabel");
    for (const labelCell of labels) {
      const labelText = (labelCell.textContent || "")
        .replace(/[:.\s/]+/g, "")
        .toLowerCase();
      if (labelText !== "mrno" && labelText !== "mrn") continue;

      const valueCell = labelCell.nextElementSibling;
      if (!valueCell || valueCell.dataset.pacsBridgeAttached === "true") return;

      const mrn = (valueCell.textContent || "").replace(/\s+/g, " ").trim();
      if (!mrn) return;

      valueCell.dataset.pacsBridgeAttached = "true";

      const innerDiv = valueCell.querySelector("div");
      if (innerDiv) {
        innerDiv.style.display = "inline-flex";
        innerDiv.style.alignItems = "center";
        innerDiv.style.gap = "6px";
      }

      const pacsBtn = document.createElement("button");
      pacsBtn.id = "hms-open-pacs-btn";
      pacsBtn.dataset.hmsBridgeUi = "true";
      pacsBtn.type = "button";
      pacsBtn.textContent = "PACS";
      pacsBtn.title = "Open studies in Medsynapse PACS";
      pacsBtn.style.cssText =
        "background:#1e40af;color:#ffffff;border:none;border-radius:4px;padding:1px 7px;cursor:pointer;font-size:11px;font-weight:600;line-height:1.4;margin-left:6px;vertical-align:middle;";

      pacsBtn.addEventListener("click", async () => {
        await extApi.runtime.sendMessage({
          type: "OPEN_PACS_BY_MRN",
          mrn,
        });
      });

      (innerDiv || valueCell).appendChild(pacsBtn);
      return;
    }
  }

  function attachOpListButtons() {
    const resultTable = document.getElementById("resultTable");
    if (!resultTable) return;

    const rows = resultTable.querySelectorAll('tr[id^="toolbarRow"]');
    for (const row of rows) {
      if (row.dataset.opButtonsAttached === "true") continue;

      const onclickAttr = row.getAttribute("onclick") || "";
      const consultMatch = onclickAttr.match(/consultation_id\s*:\s*'([^']+)'/);
      const mrnInput = row.querySelector('input[name="_mrno"]');
      const mrnMatch = onclickAttr.match(/mr_no\s*:\s*'([^']+)'/);

      const consultationId = consultMatch ? consultMatch[1].trim() : "";
      const mrn = (mrnInput ? mrnInput.value : mrnMatch ? mrnMatch[1] : "").trim();
      if (!mrn) continue;

      const nameCell = row.children[2];
      if (!nameCell) continue;

      row.dataset.opButtonsAttached = "true";

      const btnWrap = document.createElement("span");
      btnWrap.dataset.hmsBridgeUi = "true";
      btnWrap.style.cssText =
        "display:inline-flex;align-items:center;gap:4px;margin-left:6px;vertical-align:middle;";

      const makeBtn = (label, bg, url, title) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.title = title;
        b.style.cssText = `background:${bg};color:#ffffff;border:none;border-radius:3px;padding:1px 6px;cursor:pointer;font-size:10px;font-weight:600;line-height:1.4;`;
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(url, "_blank");
        });
        return b;
      };

      if (consultationId) {
        const consultUrl = `http://192.168.10.12/instahms/consultation/index.htm#/filter/1/patient/${encodeURIComponent(
          mrn
        )}/consultation/${encodeURIComponent(consultationId)}?retain_route_params=true`;
        btnWrap.appendChild(
          makeBtn("Cnslt", "#0f766e", consultUrl, "Open Consultation in new tab")
        );
      }

      const emrUrl = `http://192.168.10.12/instahms/emr/EMRMainDisplay.do?_method=list&mr_no=${encodeURIComponent(
        mrn
      )}`;
      btnWrap.appendChild(
        makeBtn("EMR", "#1e40af", emrUrl, "Open Patient EMR in new tab")
      );

      nameCell.style.whiteSpace = "nowrap";
      nameCell.appendChild(btnWrap);
    }
  }

  attachHmsPacsButton();
  attachOpListButtons();

  const observer = new MutationObserver(() => {
    attachHmsPacsButton();
    attachOpListButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
