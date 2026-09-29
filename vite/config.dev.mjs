import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const repoRoot = path.resolve(__dirname, '..')
// Parallel local previews must not overwrite one another's optimized React chunks.
const portArgument = process.argv.indexOf('--port')
const previewPort = portArgument >= 0 ? process.argv[portArgument + 1] : '8080'
const usePolling = process.env.CHOKIDAR_USEPOLLING === '1' || process.env.CARDGAME_USE_POLLING === '1'
const ignoredWatchPaths = [
    '**/.agents/**',
    '**/.codex/**',
    '**/.hopi/**',
    '**/.planning/**',
    '**/.vite/**',
    '**/.windsurf/**',
    '**/dist/**'
]

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    cacheDir: path.resolve(repoRoot, '.vite', `dev-${previewPort}`),
    plugins: [
        react(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(repoRoot, 'src'),
            '@game': path.resolve(repoRoot, 'src/game'),
            '@data': path.resolve(repoRoot, 'public/data'),
            '@types': path.resolve(repoRoot, 'public/data/types')
        }
    },
    server: {
        port: 8080,
        watch: {
            ignored: ignoredWatchPaths,
            usePolling,
            interval: usePolling ? 150 : undefined
        }
    }
})
