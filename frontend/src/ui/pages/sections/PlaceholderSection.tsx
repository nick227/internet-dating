import { useLayoutEffect } from 'react'
import type { CountRegister, HeaderRegister } from './connectionTypes'
import { readyCount, type SectionId } from './sectionsConfig'

export function PlaceholderSection({
  registerHeader,
  registerCount,
  sectionId,
  title,
  message,
  detail,
}: {
  registerHeader: HeaderRegister
  registerCount: CountRegister
  sectionId: SectionId
  title: string
  message: string
  detail?: string
}) {
  useLayoutEffect(() => {
    registerHeader(sectionId, { onRefresh: null, refreshDisabled: true, title })
    registerCount(sectionId, readyCount(0))
  }, [registerHeader, registerCount, sectionId, title])

  return (
    <div className="inboxState" role="status" aria-live="polite">
      <div>{message}</div>
      {detail && <div className="u-muted">{detail}</div>}
    </div>
  )
}
