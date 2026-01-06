import { useNavigate } from 'react-router-dom'

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
  const nav = useNavigate()

  return (
    <div className="personality-portal__intro">
      <h1 onClick={() => nav('/personality')} className="personality-portal__title">{title}</h1>
      <p className="personality-portal__subtitle">{subtitle}</p>
    </div>
  )
}
