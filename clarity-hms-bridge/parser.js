(function (global) {
  "use strict";

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeLabel(labelText) {
    return cleanText(labelText).replace(/[:.\s/]+/g, "").toLowerCase();
  }

  function parseAgeAndGender(rawText) {
    const text = cleanText(rawText);
    let age = "";
    let ageNote = "";
    let gender = "";

    // Match years like "50Y", "50 Y", "50 Yrs", "50 Years"
    const yearMatch = text.match(/(\d+)\s*(?:Y|Yr|Yrs|Year|Years)\b/i);
    if (yearMatch) {
      age = yearMatch[1];
    } else if (/\d+\s*(?:M|Mo|Months?|D|Days?)\b/i.test(text)) {
      // Pediatric age in months/days; ClarityMDT expects an integer year
      age = "0";
      ageNote = "Pediatric (<1Y) — please verify age";
    }

    const genderMatch = text.match(/\b(Female|Male|Other|F|M)\b/i);
    if (genderMatch) {
      const g = genderMatch[1].toLowerCase();
      if (g === "f" || g === "female") gender = "Female";
      else if (g === "m" || g === "male") gender = "Male";
      else gender = "Other";
    }

    return { age, ageNote, gender };
  }

  function isInstaHmsLoginPage(doc) {
    if (!doc) return false;
    const hasDetails = Boolean(doc.querySelector("#patientDetailsTab"));
    const hasPassword = Boolean(doc.querySelector('input[type="password"]'));
    return !hasDetails && hasPassword;
  }

  function parseInstaHmsPatient(doc) {
    if (!doc) return null;
    const table = doc.querySelector("#patientDetailsTab");
    if (!table) return null;

    const result = {
      mrn: "",
      patientName: "",
      age: "",
      gender: "",
      ageNote: "",
    };

    const labels = table.querySelectorAll("td.formlabel");
    for (const labelCell of labels) {
      const valueCell = labelCell.nextElementSibling;
      if (!valueCell || !valueCell.classList.contains("forminfo")) continue;

      const key = normalizeLabel(labelCell.textContent);
      const innerDiv = valueCell.querySelector("div[title]");
      const rawValue = cleanText(
        valueCell.textContent || (innerDiv ? innerDiv.getAttribute("title") : "")
      );

      if (key === "mrno" || key === "mrn") {
        result.mrn = rawValue;
      } else if (key === "name" || key === "patientname") {
        result.patientName = rawValue;
      } else if (key === "agegender") {
        const fallbackTitle = innerDiv ? cleanText(innerDiv.getAttribute("title")) : "";
        const parsed = parseAgeAndGender(rawValue || fallbackTitle);
        result.age = parsed.age;
        result.gender = parsed.gender;
        result.ageNote = parsed.ageNote;
      }
    }

    if (!result.mrn && !result.patientName) {
      return null;
    }

    return result;
  }

  global.ClarityHmsParser = {
    parseInstaHmsPatient,
    isInstaHmsLoginPage,
  };
})(globalThis);
