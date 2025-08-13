import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Must match GitHub repo name exactly (case-sensitive)
    base: '/Vibe-Coding---RTO-management/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'), // points to your source folder
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true, // cleans dist before building
    },
  };
});
