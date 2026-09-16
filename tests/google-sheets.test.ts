import { describe, expect, it } from "vitest";
import { GoogleSheetsConfigError, normalizePrivateKey, readGoogleSheetsConfig } from "../lib/google-sheets";

describe("Google Sheets config", () => {
  it("converts escaped newlines in private keys", () => {
    expect(normalizePrivateKey("line1\\nline2")).toBe("line1\nline2");
  });

  it("reads all required environment variables", () => {
    expect(readGoogleSheetsConfig({
      GOOGLE_SHEETS_SPREADSHEET_ID: "sheet-id",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "bot@example.iam.gserviceaccount.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "key\\nvalue"
    })).toEqual({
      spreadsheetId: "sheet-id",
      email: "bot@example.iam.gserviceaccount.com",
      privateKey: "key\nvalue"
    });
  });

  it("rejects incomplete environment variables", () => {
    expect(() => readGoogleSheetsConfig({})).toThrow(GoogleSheetsConfigError);
  });
});
