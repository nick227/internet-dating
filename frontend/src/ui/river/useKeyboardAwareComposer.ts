import { useEffect, useRef, useState } from 'react'

/**
 * Hook for keyboard-aware composer positioning
 * SRP: Handles iOS keyboard, safe-area, and viewport adjustments
 */
export function useKeyboardAwareComposer() {
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const composerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Visual Viewport API (modern browsers)
    const visualViewport = window.visualViewport
    if (visualViewport) {
      const handleResize = () => {
        const viewportHeight = visualViewport.height
        const windowHeight = window.innerHeight
        const heightDiff = windowHeight - viewportHeight

        if (heightDiff > 150) {
          // Keyboard is likely open
          setKeyboardHeight(heightDiff)
          setIsKeyboardVisible(true)
        } else {
          setKeyboardHeight(0)
          setIsKeyboardVisible(false)
        }
      }

      visualViewport.addEventListener('resize', handleResize)
      return () => visualViewport.removeEventListener('resize', handleResize)
    }

    // Fallback: window resize (less accurate)
    const handleResize = () => {
      // Estimate keyboard height (not perfect, but better than nothing)
      const viewportHeight = window.innerHeight
      const screenHeight = window.screen.height
      const heightDiff = screenHeight - viewportHeight

      if (heightDiff > 150) {
        setKeyboardHeight(heightDiff)
        setIsKeyboardVisible(true)
      } else {
        setKeyboardHeight(0)
        setIsKeyboardVisible(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Scroll composer into view when keyboard opens
  useEffect(() => {
    if (isKeyboardVisible && composerRef.current) {
      composerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [isKeyboardVisible])

  return {
    composerRef,
    keyboardHeight,
    isKeyboardVisible,
  }
}
