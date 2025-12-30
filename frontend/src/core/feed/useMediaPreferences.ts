import { useEffect, useState } from 'react'

export function useMediaPreferences() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [dataSaverMode, setDataSaverMode] = useState(false)

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const dataSaverQuery =
      (navigator as { connection?: { saveData?: boolean } }).connection?.saveData ?? false

    setPrefersReducedMotion(motionQuery.matches)
    setDataSaverMode(dataSaverQuery)

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    motionQuery.addEventListener('change', handleMotionChange)

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange)
    }
  }, [])

  return {
    prefersReducedMotion,
    dataSaverMode,
    autoplayEnabled: !prefersReducedMotion && !dataSaverMode,
  }
}
