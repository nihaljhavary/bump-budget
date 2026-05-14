/**
 * bump. — useVersionCheck
 *
 * Polls /version.json on window focus and every CHECK_INTERVAL ms.
 * If the deployed buildId differs from the one baked into the current bundle,
 * sets updateAvailable = true so the UI can prompt a refresh.
 *
 * Safe to use in dev — polling is skipped when BUILD_ID is the local fallback
 * (i.e. not a Netlify DEPLOY_ID).
 */

import { useEffect, useRef, useState } from 'react'

const CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes

// Injected by vite.config.js at build time
/* global __BUMP_BUILD_ID__ */
const CURRENT_BUILD_ID = typeof __BUMP_BUILD_ID__ !== 'undefined' ? __BUMP_BUILD_ID__ : 'dev'

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const lastChecked = useRef(0)

  useEffect(() => {
    // Don't run in local dev — build ID is a timestamp fallback, not a deploy ID
    if (CURRENT_BUILD_ID === 'dev') return

    async function check() {
      // Throttle: skip if checked in the last 60 seconds
      if (Date.now() - lastChecked.current < 60_000) return
      lastChecked.current = Date.now()

      try {
        const res = await fetch('/version.json?_=' + Date.now(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (!res.ok) return
        const { buildId } = await res.json()
        if (buildId && buildId !== CURRENT_BUILD_ID) {
          setUpdateAvailable(true)
        }
      } catch {
        // Network failure — silently ignore, try again next time
      }
    }

    // Check on focus (most reliable trigger — user returns to tab/app)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)

    // Check on interval
    const timer = setInterval(check, CHECK_INTERVAL)

    // Initial check after a short delay (let the app fully load first)
    const boot = setTimeout(check, 10_000)

    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(timer)
      clearTimeout(boot)
    }
  }, [])

  return { updateAvailable, currentBuildId: CURRENT_BUILD_ID }
}
