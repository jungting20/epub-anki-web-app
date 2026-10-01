import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Every test run uses its own server and data directory, never the personal library.
const testDataRoot = mkdtempSync(path.join(tmpdir(), "leaf-browser-tests-"));
export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  workers: 1,
  webServer: {
    command: "npm run start -- --port 3002",
    url: "http://127.0.0.1:3002",
    reuseExistingServer: false,
    env: { EPUB_DATA_DIR: testDataRoot },
    timeout: 30000,
  },
  use: {
    baseURL: "http://127.0.0.1:3002",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  },
});
