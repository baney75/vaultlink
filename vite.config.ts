import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { parseCustomOrigin } from './src/lib/origin';
// Optional: VAULTLINK_CUSTOM_ORIGIN=https://vault.example.com npm run build
const customOrigin = process.env.VAULTLINK_CUSTOM_ORIGIN?.trim() ? parseCustomOrigin(process.env.VAULTLINK_CUSTOM_ORIGIN) : '';
export default defineConfig({define:{__VAULTLINK_CUSTOM_ORIGIN__:JSON.stringify(customOrigin)},plugins:[react()],base:'./',server:{host:'127.0.0.1',port:5178,strictPort:true},build:{outDir:'dist',chunkSizeWarningLimit:1600}});
