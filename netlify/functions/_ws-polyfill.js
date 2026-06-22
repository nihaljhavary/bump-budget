import { WebSocket as WS } from 'ws'
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WS
}
