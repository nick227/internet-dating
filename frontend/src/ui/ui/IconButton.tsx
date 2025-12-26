import React from 'react'

export function IconButton({
  children,
  label,
  active,
  onClick
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button className={'iconBtn' + (active ? ' iconBtn--active' : '')} aria-label={label} title={label} onClick={onClick} type="button">
      {children}
    </button>
  )
}
