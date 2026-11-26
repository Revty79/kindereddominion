import {defineConfig,devices} from "@playwright/test";
export default defineConfig({testDir:"./tests/browser",workers:1,fullyParallel:false,timeout:180000,outputDir:"../test-results/backend",use:{baseURL:process.env.KINDRED_ACCOUNT_URL??"http://127.0.0.1:5177",...devices["Desktop Chrome"],trace:"off",actionTimeout:15000,navigationTimeout:30000},projects:[{name:"account-chromium"}]});
