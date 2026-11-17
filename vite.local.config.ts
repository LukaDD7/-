import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { localAI } from './build/local-ai-plugin';
import { teacherOCR } from './build/teacher-ocr-plugin';
export default defineConfig({
 plugins:[react(),localAI(),teacherOCR()],
 resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},
 server:{host:'127.0.0.1',port:5173,strictPort:true},
 build:{outDir:'dist-local'},
});
