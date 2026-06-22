/**
 * WebSocket polyfill for Node.js < 22 (Netlify functions run on Node 18/20).
 * supabase-js v2 requires a WebSocket implementation for its Realtime client.
 * Import this file at the top of any Netlify function that creates a Supabase client.
 *
 * Usage:  import '._ws-polyfill.js'
 */
import { WebSocket as WS } from 'ws'

if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-ignore
  globalThis.WebSocket = WS
}
