import { NavLink, Outlet, useMatch } from 'react-router-dom'
import { PersonalityPortalHeader } from '../personality-portal/PersonalityPortalHeader'

export function PersonalityPortalPage() {
  const isQuizzes = Boolean(useMatch('/personality/quizzes'))
  const isInterests = Boolean(useMatch('/personality/interests'))
  const panelId = isQuizzes
    ? 'personality-panel-quizzes'
    : isInterests
    ? 'personality-panel-interests'
    : 'personality-panel'

  return (
    <div className="personality-portal">
      <PersonalityPortalHeader />

      <div className="personality-portal__tabs" role="tablist" aria-label="Personality portal sections">
        <NavLink
          to="/personality/quizzes"
          role="tab"
          aria-controls="personality-panel-quizzes"
          aria-selected={isQuizzes ? 'true' : 'false'}
          className={({ isActive }) =>
            `personality-portal__tab${isActive ? ' personality-portal__tab--active' : ''}`
          }
        >
          Quizzes
        </NavLink>
        <NavLink
          to="/personality/interests"
          role="tab"
          aria-controls="personality-panel-interests"
          aria-selected={isInterests ? 'true' : 'false'}
          className={({ isActive }) =>
            `personality-portal__tab${isActive ? ' personality-portal__tab--active' : ''}`
          }
        >
          Interests
        </NavLink>
      </div>

      <div className="personality-portal__panel" role="tabpanel" aria-live="polite" id={panelId}>
        <Outlet />
      </div>
    </div>
  )
}
