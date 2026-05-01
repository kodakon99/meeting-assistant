import { Link, useLocation } from 'react-router-dom'
import type { Project } from '../lib/types'

export function ProjectTabs({ project }: { project: Project | null }) {
  const location = useLocation()
  if (!project) return null

  const meetingsPath = `/projects/${project.id}`
  const teamPath = `/projects/${project.id}/team`
  const personalPath =
    project.participants[0]
      ? `/projects/${project.id}/me/${project.participants[0].id}`
      : `/projects/${project.id}/me`
  const personalPrefix = `/projects/${project.id}/me`

  const path = location.pathname
  const isMeetings =
    path === meetingsPath ||
    path.startsWith(`${meetingsPath}/meetings`) ||
    path === `${meetingsPath}/`
  const isTeam = path === teamPath
  const isPersonal = path.startsWith(personalPrefix)

  return (
    <div className="flex gap-1 border-b border-line">
      <Tab to={meetingsPath} active={isMeetings}>
        Meetings
      </Tab>
      <Tab to={teamPath} active={isTeam}>
        Team dashboard
      </Tab>
      <Tab to={personalPath} active={isPersonal}>
        My tasks
      </Tab>
    </div>
  )
}

function Tab({
  to,
  children,
  active,
}: {
  to: string
  children: React.ReactNode
  active: boolean
}) {
  return (
    <Link
      to={to}
      className={`-mb-px px-4 py-2 text-[13px] font-semibold transition-colors ${
        active
          ? 'border-b-2 border-accent text-accent-ink'
          : 'border-b-2 border-transparent text-ink-3 hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}
