import type { ElementType, ReactNode } from 'react'

type PortalItemIntent = 'navigable' | 'selectable' | 'active'

type PortalItemFrameProps = {
  as?: ElementType
  children: ReactNode
  className?: string
  intent?: PortalItemIntent | PortalItemIntent[]
  accent?: boolean
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

export function PortalItemFrame({
  as: Component = 'div',
  children,
  className,
  intent,
  accent = false,
  ...rest
}: PortalItemFrameProps) {
  const intents = Array.isArray(intent) ? intent : intent ? [intent] : []
  const intentClasses = intents.map(value => `portal-item--${value}`).join(' ')
  const accentClass = accent ? 'portal-item--accent' : ''
  const classes = ['portal-item', intentClasses, accentClass, className].filter(Boolean).join(' ')

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  )
}
