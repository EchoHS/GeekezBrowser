import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js'),
          'chromium-path': resolve(__dirname, 'src/main/chromium-path.js'),
          'close-behavior': resolve(__dirname, 'src/main/close-behavior.js'),
          'native-glass': resolve(__dirname, 'src/main/native-glass.js'),
          'xray-assets': resolve(__dirname, 'src/main/xray-assets.js'),
          'release-check': resolve(__dirname, 'src/main/release-check.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()]
  }
})
