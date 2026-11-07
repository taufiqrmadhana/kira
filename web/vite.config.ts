import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],resolve:{dedupe:['react','react-dom']},build:{rollupOptions:{output:{manualChunks(id){if(/node_modules\/(react|react-dom|scheduler)\//.test(id))return 'react-runtime';}}}},server:{proxy:{'/api':'http://127.0.0.1:8000'}},test:{include:['src/**/*.test.ts','src/**/*.test.tsx'],environment:'jsdom',setupFiles:['./src/test-setup.ts']}});
