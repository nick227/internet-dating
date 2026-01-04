import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export function useAppNavigation() {
  const nav = useNavigate()

  const goToFeed = useCallback(() => {
    nav('/feed')
  }, [nav])

  const goToLogin = useCallback((mode: 'login' | 'signup' = 'login') => {
    nav(`/login?mode=${mode}`)
  }, [nav])

  const goToProfile = useCallback((userId: string | number) => {
    nav(`/profiles/${encodeURIComponent(String(userId))}`)
  }, [nav])

  const goToQuizPortalPage = useCallback(() => {
    nav('/personality/quizzes')
  }, [nav])

  const goToInterestsPortalPage = useCallback(() => {
    nav('/personality/interests')
  }, [nav])

  const goToPersonalityPortalPage = useCallback(() => {
    nav('/personality/quizzes')
  }, [nav])

  const toUserIdString = useCallback((userId: string | number | null | undefined): string | null => {
    if (userId == null) return null
    return String(userId)
  }, [])

  return {
    goToFeed,
    goToLogin,
    goToProfile,
    goToQuizPortalPage,
    goToInterestsPortalPage,
    goToPersonalityPortalPage,
    toUserIdString,
  }
}
