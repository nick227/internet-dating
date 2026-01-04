const DEFAULT_TITLE = 'Personality Portal'
const DEFAULT_SUBTITLE = 'Explore quizzes and interests to help us match you better.'

type PersonalityPortalHeaderProps = {
  title?: string
  subtitle?: string
}

export function PersonalityPortalHeader({
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
}: PersonalityPortalHeaderProps) {
  return (
    <div className="personality-portal__intro">
      <h1 className="personality-portal__title">{title}</h1>
      <p className="personality-portal__subtitle">{subtitle}</p>
    </div>
  )
}
