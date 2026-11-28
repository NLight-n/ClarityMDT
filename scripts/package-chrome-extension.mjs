import fs from "fs";
import path from "path";
import archiver from "archiver";

const rootDir = process.cwd();
const srcDir = path.join(rootDir, "clarity-hms-bridge");
const outPath = path.join(rootDir, "public", "downloads", "clarity-hms-bridge-chrome.zip");

const manifest = JSON.parse(
  fs.readFileSync(path.join(srcDir, "manifest.json"), "utf8")
);

// Transform Firefox MV3 manifest to Chrome/Edge MV3 manifest
const chromeManifest = {
  ...manifest,
  icons: {
    192: "icons/icon-192.png",
  },
  action: {
    default_title: manifest.action?.default_title || "Send patient to ClarityMDT",
    default_icon: {
      48: "icons/icon-192.png",
    },
  },
  background: {
    service_worker: "background.js",
  },
};
delete chromeManifest.browser_specific_settings;

fs.mkdirSync(path.dirname(outPath), { recursive: true });

const output = fs.createWriteStream(outPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`Created ${outPath} (${archive.pointer()} bytes)`);
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);

archive.append(JSON.stringify(chromeManifest, null, 2) + "\n", {
  name: "manifest.json",
});

for (const file of [
  "background.js",
  "clarity-content.js",
  "crypto-vault.js",
  "hms-content.js",
  "login-content.js",
  "pacs-content.js",
  "parser.js",
  "options.html",
  "options.js",
  "popup.html",
  "popup.js",
  "unlock.html",
  "unlock.js",
]) {
  archive.file(path.join(srcDir, file), { name: file });
}

archive.file(path.join(srcDir, "icons", "icon-192.png"), {
  name: "icons/icon-192.png",
});

await archive.finalize();
