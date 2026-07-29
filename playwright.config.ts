import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4174", viewport: { width: 390, height: 844 }, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "npm run build && npx serve -s dist -l 4174", url: "http://127.0.0.1:4174", reuseExistingServer: false, timeout: 120_000 },
});
