import React from 'react'

export function IconButton({
  children,
  label,
  active,
  onClick,
  className,
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const baseClass = 'iconBtn' + (active ? ' iconBtn--active' : '')
  const finalClass = className ? `${baseClass} ${className}` : baseClass
  return (
    <button className={finalClass} aria-label={label} title={label} onClick={onClick} type="button">
      {children}
    </button>
  )
}
