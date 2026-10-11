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
          'sync-format': resolve(__dirname, 'src/main/sync-format.js'),
          'sync-revisions': resolve(__dirname, 'src/main/sync-revisions.js'),
          'webdav-store': resolve(__dirname, 'src/main/webdav-store.js'),
          'webdav-sync': resolve(__dirname, 'src/main/webdav-sync.js'),
          'profile-sync': resolve(__dirname, 'src/main/profile-sync.js'),
          'passkeys': resolve(__dirname, 'src/main/passkeys.js'),
          'chromium-path': resolve(__dirname, 'src/main/chromium-path.js'),
          'close-behavior': resolve(__dirname, 'src/main/close-behavior.js'),
          'native-glass': resolve(__dirname, 'src/main/native-glass.js'),
          'xray-assets': resolve(__dirname, 'src/main/xray-assets.js'),
          'release-check': resolve(__dirname, 'src/main/release-check.js'),
          'local-proxy-port': resolve(__dirname, 'src/main/local-proxy-port.js'),
          'audio-noise': resolve(__dirname, 'src/main/audio-noise.js'),
          'canvas-noise': resolve(__dirname, 'src/main/canvas-noise.js'),
          'media-device-profile': resolve(__dirname, 'src/main/media-device-profile.js'),
          'voice-profile': resolve(__dirname, 'src/main/voice-profile.js')
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
