/**
 * debug-ai.js — DISABLED IN PRODUCTION
 * This diagnostic endpoint has been locked down.
 * Admin-only access remains via admin-data.js actions.
 */
export async function handler() {
  return {
    statusCode: 404,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Not found' }),
  }
}
