import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '../src'),
            '@game': path.resolve(__dirname, '../src/game'),
            '@data': path.resolve(__dirname, '../public/data')
        }
    },
    server: {
        port: 8080
    }
})
