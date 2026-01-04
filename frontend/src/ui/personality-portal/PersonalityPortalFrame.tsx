import type { ReactNode } from 'react'
import { PersonalityPortalHeader } from '../personality-portal/PersonalityPortalHeader'

type PersonalityPortalFrameProps = {
  variant?: 'standalone' | 'embedded'
  children: ReactNode
}

export function PersonalityPortalFrame({
  variant = 'standalone',
  children,
}: PersonalityPortalFrameProps) {
  if (variant === 'embedded') {
    return <div className="portal-shell portal-shell--embedded">{children}</div>
  }

  return (
    <div className="personality-portal">
      <PersonalityPortalHeader />
      <div className="personality-portal__panel">{children}</div>
    </div>
  )
}
