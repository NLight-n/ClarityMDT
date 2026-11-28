"use strict";

(function () {
  const extApi = globalThis.browser ?? globalThis.chrome;

  function setInputValue(el, value) {
    if (!el || value === undefined || value === null) return;
    const strVal = String(value);
    const proto =
      el.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, strVal);
    } else {
      el.value = strVal;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function detectLoginTarget() {
    const { host, pathname } = window.location;
    if (host === "192.168.10.222" && /\/PACSLogin/i.test(pathname)) {
      return "pacs";
    }
    if (host === "192.168.10.12" && /\/instahms\/.*loginForm\.do/i.test(pathname)) {
      return "instahms";
    }
    if (
      (host === "192.168.11.143" || host.startsWith("localhost")) &&
      /^\/irlog\/login/i.test(pathname)
    ) {
      return "irlog";
    }
    if (
      (host === "192.168.11.143" || host.startsWith("localhost")) &&
      /^\/login/i.test(pathname)
    ) {
      return "clarity";
    }
    return null;
  }

  function fillAndSubmit(target, creds) {
    if (!creds || !creds.username || !creds.password) return false;

    if (target === "clarity") {
      const userEl = document.getElementById("loginId");
      const passEl = document.getElementById("password");
      const btn = document.querySelector('button[type="submit"]');
      if (!userEl || !passEl || !btn) return false;
      setInputValue(userEl, creds.username);
      setInputValue(passEl, creds.password);
      setTimeout(() => btn.click(), 80);
      return true;
    }

    if (target === "irlog") {
      const userEl = document.getElementById("username");
      const passEl = document.getElementById("password");
      const btn = document.querySelector('button[type="submit"]');
      if (!userEl || !passEl || !btn) return false;
      setInputValue(userEl, creds.username);
      setInputValue(passEl, creds.password);
      setTimeout(() => btn.click(), 80);
      return true;
    }

    if (target === "instahms") {
      const hospEl = document.querySelector(
        'input[name*="hospital" i], input[id*="hospital" i], select[name*="hospital" i], select[id*="hospital" i]'
      );
      const userEl = document.querySelector(
        'input[name*="user" i], input[id*="user" i], input[name*="login" i], input[type="text"]'
      );
      const passEl = document.querySelector('input[type="password"]');
      const btn = document.querySelector(
        'input[type="submit"], button[type="submit"]'
      );
      if (!userEl || !passEl || !btn) return false;
      if (hospEl && creds.hospital) {
        setInputValue(hospEl, creds.hospital);
      }
      setInputValue(userEl, creds.username);
      setInputValue(passEl, creds.password);
      setTimeout(() => btn.click(), 80);
      return true;
    }

    if (target === "pacs") {
      const userEl = document.querySelector(
        'input[name*="user" i], input[id*="user" i], input[name*="login" i], input[type="text"]'
      );
      const passEl = document.querySelector('input[type="password"]');
      const btn = document.querySelector(
        'input[type="submit"], button[type="submit"], #btnLogin, input[value*="login" i]'
      );
      if (!userEl || !passEl || !btn) return false;
      setInputValue(userEl, creds.username);
      setInputValue(passEl, creds.password);
      setTimeout(() => btn.click(), 80);
      return true;
    }

    return false;
  }

  const target = detectLoginTarget();
  if (!target) return;

  let attempted = false;
  async function tryAutoLogin() {
    if (attempted) return;
    attempted = true;

    try {
      const res = await extApi.runtime.sendMessage({
        type: "CONSUME_AUTO_LOGIN",
        target,
      });
      if (res && res.ok && res.creds) {
        fillAndSubmit(target, res.creds);
      }
    } catch (_err) {
      // Ignore
    }
  }

  // Wait briefly for React hydration on ClarityMDT / IRLog
  setTimeout(tryAutoLogin, 250);
})();
