import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:45000,expect:{timeout:10000},reporter:[['list']],use:{headless:true,viewport:{width:1440,height:900},trace:'retain-on-failure',screenshot:'only-on-failure'}});
