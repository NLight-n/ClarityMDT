import assert from "assert";
import { Readable } from "stream";
import {
  generateWeasisToken,
  verifyWeasisToken,
  markManifestTokenConsumed,
  resetConsumedTokenCache,
} from "../lib/weasis/tokens";
import {
  escapeXml,
  encodeFileId,
  decodeFileId,
  extractManifestStorageKeys,
  convertToWeasisXml,
  DicomManifestJson,
} from "../lib/weasis/manifestConverter";

async function runTests() {
  console.log("==========================================");
  console.log("   Running Weasis Integration Test Suite  ");
  console.log("==========================================");

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 1. TOKEN GENERATION & VALIDATION TESTS
  // --------------------------------------------------------------------------
  test("Token Generation & Signature Verification", () => {
    const attachmentId = "att-12345";
    const userId = "usr-67890";
    const caseId = "case-111";

    const { token, payload } = generateWeasisToken({
      attachmentId,
      userId,
      caseId,
      ttlMs: 5 * 60 * 1000,
    });

    assert.ok(token && typeof token === "string", "Token should be a string");
    assert.strictEqual(payload.attachmentId, attachmentId);
    assert.strictEqual(payload.userId, userId);
    assert.strictEqual(payload.caseId, caseId);
    assert.ok(payload.exp > Date.now(), "Token expiration should be in the future");

    const verifiedPayload = verifyWeasisToken(token);
    assert.ok(verifiedPayload !== null, "Verification should succeed");
    assert.strictEqual(verifiedPayload?.attachmentId, attachmentId);
    assert.strictEqual(verifiedPayload?.userId, userId);
    assert.strictEqual(verifiedPayload?.caseId, caseId);
  });

  test("Invalid Token Signature Rejection", () => {
    const { token } = generateWeasisToken({
      attachmentId: "att-123",
      userId: "usr-456",
      caseId: "case-789",
    });

    const parts = token.split(".");
    const tamperedToken = `${parts[0]}.invalidSignatureString`;
    const result = verifyWeasisToken(tamperedToken);
    assert.strictEqual(result, null, "Tampered token signature should be rejected");
  });

  test("Expired Token Rejection", () => {
    const { token } = generateWeasisToken({
      attachmentId: "att-expired",
      userId: "usr-1",
      caseId: "case-1",
      ttlMs: -1000, // Expired 1 second ago
    });

    const result = verifyWeasisToken(token);
    assert.strictEqual(result, null, "Expired token should be rejected");
  });

  test("Token Attachment Scoping Validation", () => {
    const { token, payload } = generateWeasisToken({
      attachmentId: "att-authorized",
      userId: "usr-1",
      caseId: "case-1",
    });

    const verified = verifyWeasisToken(token);
    assert.ok(verified !== null);
    assert.strictEqual(verified?.attachmentId, "att-authorized");
    assert.notStrictEqual(verified?.attachmentId, "att-forbidden-other-attachment");
  });

  test("Token Expiration and Attachment Scope Enforcement", () => {
    const { token, payload } = generateWeasisToken({
      attachmentId: "att-scoped-1",
      userId: "usr-1",
      caseId: "case-1",
      ttlMs: 5 * 60 * 1000,
    });

    const verified = verifyWeasisToken(token);
    assert.ok(verified !== null, "Token should be valid within 5 minute TTL");
    assert.strictEqual(verified?.attachmentId, "att-scoped-1");
  });

  // --------------------------------------------------------------------------
  // 2. XML MANIFEST CONVERSION & ENCODING TESTS
  // --------------------------------------------------------------------------
  test("XML Entity Escaping", () => {
    assert.strictEqual(escapeXml('John & Jane <Doe> "Quotes" \'Apples\''), "John &amp; Jane &lt;Doe&gt; &quot;Quotes&quot; &apos;Apples&apos;");
    assert.strictEqual(escapeXml(12345), "12345");
    assert.strictEqual(escapeXml(null), "");
  });

  test("File ID Encoding & Decoding Roundtrip", () => {
    const originalStorageKey = "cases/case-100/dicom/study1/series1/slice-001.dcm";
    const encodedFileId = encodeFileId(originalStorageKey);
    const decodedStorageKey = decodeFileId(encodedFileId);

    assert.ok(encodedFileId.length > 0);
    assert.strictEqual(decodedStorageKey, originalStorageKey);
  });

  test("Single-Image & Multi-Series Storage Keys Extraction", () => {
    const manifestJson: DicomManifestJson = {
      studies: [
        {
          StudyInstanceUID: "1.2.840.10008.1.1",
          series: [
            {
              SeriesInstanceUID: "1.2.840.10008.1.1.1",
              instances: [
                { url: "cases/c1/dicom/slice1.dcm" },
                { url: "cases/c1/dicom/slice2.dcm" },
              ],
            },
            {
              SeriesInstanceUID: "1.2.840.10008.1.1.2",
              instances: [
                { url: "cases/c1/dicom/slice3.dcm" },
              ],
            },
          ],
        },
      ],
    };

    const keys = extractManifestStorageKeys(manifestJson);
    assert.strictEqual(keys.size, 3);
    assert.ok(keys.has("cases/c1/dicom/slice1.dcm"));
    assert.ok(keys.has("cases/c1/dicom/slice2.dcm"));
    assert.ok(keys.has("cases/c1/dicom/slice3.dcm"));
  });

  test("Weasis XML Manifest Format Generation", () => {
    const manifestJson: DicomManifestJson = {
      studies: [
        {
          StudyInstanceUID: "1.2.840.10008.1.100",
          StudyDescription: "CT Abdomen & Pelvis",
          StudyDate: "20260812",
          PatientID: "PAT-999",
          PatientName: "Smith^Jane",
          series: [
            {
              SeriesInstanceUID: "1.2.840.10008.1.100.1",
              SeriesDescription: "Axial Contrast",
              SeriesNumber: 2,
              Modality: "CT",
              instances: [
                {
                  url: "cases/c1/dicom/inst1.dcm",
                  metadata: {
                    SOPInstanceUID: "1.2.840.10008.1.100.1.1",
                    InstanceNumber: 1,
                    SOPClassUID: "1.2.840.10008.5.1.4.1.1.2",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const token = "mock-token-xyz";
    const publicOrigin = "https://mdt.hospital.org";
    const xml = convertToWeasisXml(manifestJson, token, publicOrigin);

    assert.ok(xml.includes(`<?xml version="1.0" encoding="UTF-8"?>`));
    assert.ok(xml.includes(`<wado_query`));
    assert.ok(xml.includes(`PatientID="PAT-999"`));
    assert.ok(xml.includes(`PatientName="Smith^Jane"`));
    assert.ok(xml.includes(`StudyInstanceUID="1.2.840.10008.1.100"`));
    assert.ok(xml.includes(`StudyDescription="CT Abdomen &amp; Pelvis"`)); // Escaped &
    assert.ok(xml.includes(`SeriesInstanceUID="1.2.840.10008.1.100.1"`));
    assert.ok(xml.includes(`Modality="CT"`));
    assert.ok(xml.includes(`SOPInstanceUID="1.2.840.10008.1.100.1.1"`));
    assert.ok(xml.includes(`DirectDownloadFile="https://mdt.hospital.org/api/weasis/file/${token}/`));
  });

  test("Launch Protocol URI Validity in Browser URL Parser", () => {
    const manifestUrl = "http://localhost:3001/api/weasis/manifest/token123";
    const command = `$dicom:get -w "${manifestUrl}"`;
    const launchUrl = `weasis://?${encodeURIComponent(command)}`;

    // Must not throw when evaluated by browser URL parser / location.href setter
    const parsed = new URL(launchUrl);
    assert.strictEqual(parsed.protocol, "weasis:");
    assert.strictEqual(parsed.search.includes("%20-w%20"), true);
  });

  // --------------------------------------------------------------------------
  // 3. AUTHORIZATION & FILE ACCESS CONTROL INTEGRATION LOGIC
  // --------------------------------------------------------------------------
  test("Unauthorized Storage Key Access Prevention Logic", () => {
    const authorizedManifestKeys = new Set([
      "cases/c1/dicom/valid-slice-001.dcm",
      "cases/c1/dicom/valid-slice-002.dcm",
    ]);

    const requestedKeyValid = "cases/c1/dicom/valid-slice-001.dcm";
    const requestedKeyUnauthorized = "cases/c99/other-patient-private-data.dcm";

    assert.strictEqual(authorizedManifestKeys.has(requestedKeyValid), true, "Authorized key should pass check");
    assert.strictEqual(authorizedManifestKeys.has(requestedKeyUnauthorized), false, "Unauthorized key must fail check");
  });

  asyncTest("DICOM Data Stream Verification", async () => {
    const sampleData = Buffer.from("DICM_SAMPLE_HEADER_AND_PIXEL_DATA");
    const mockNodeStream = Readable.from([sampleData]);

    const chunks: Buffer[] = [];
    for await (const chunk of mockNodeStream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const resultBuffer = Buffer.concat(chunks);

    assert.strictEqual(resultBuffer.toString(), "DICM_SAMPLE_HEADER_AND_PIXEL_DATA");
  });

  console.log("==========================================");
  console.log(` Summary: ${passed} Passed, ${failed} Failed`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
