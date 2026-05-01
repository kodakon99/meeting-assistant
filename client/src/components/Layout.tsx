import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { Project } from '../lib/types'
import { Logo } from './ui/Logo'
import { Avatar } from './ui/Avatar'
import { hueFromString } from './ui/hue'

export function Layout() {
  const [projects, setProjects] = useState<Project[]>([])
  const location = useLocation()
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .listProjects()
      .then((p) => {
        if (!cancelled) setProjects(p)
      })
      .catch(() => {
        // ignore; server may not be up yet
      })
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  const filtered = useMemo(
    () =>
      projects.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [projects, query],
  )

  const activeProject = useMemo(() => {
    const m = location.pathname.match(/^\/projects\/([^/]+)/)
    if (!m) return null
    return projects.find((p) => p.id === m[1]) ?? null
  }, [projects, location.pathname])

  return (
    <div className="grid h-full" style={{ gridTemplateColumns: '280px 1fr' }}>
      <aside
        className="flex flex-col gap-[18px] border-r border-line px-3.5 pt-[18px] pb-3 overflow-hidden"
        style={{
          background:
            'linear-gradient(180deg, oklch(1 0 0) 0%, oklch(0.97 0.006 80) 100%)',
        }}
      >
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 px-1.5">
          <Logo size={26} />
          <div>
            <p className="m-0 font-semibold text-[15px] tracking-tight text-ink">
              Meeting Assistant
            </p>
            <p className="m-0 text-[11px] text-ink-3">meeting → action</p>
          </div>
        </Link>

        {/* Search */}
        <div className="flex items-center gap-2 bg-surface border border-line rounded-[10px] px-2.5 py-2 text-ink-3 transition focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle
              cx="7"
              cy="7"
              r="5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M11 11 L14 14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, people, tasks…"
            className="flex-1 border-0 outline-none bg-transparent text-ink placeholder:text-ink-3 text-[13px]"
          />
          <kbd className="font-mono text-[11px] border border-line-2 rounded px-1.5 py-px text-ink-3 bg-surface-2">
            ⌘K
          </kbd>
        </div>

        {/* Projects */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-3">
            <span>Projects</span>
            <Link
              to="/projects/new"
              className="text-accent font-semibold text-[11px] hover:underline"
            >
              + New
            </Link>
          </div>
          <ul className="flex flex-col gap-0.5 m-0 p-0 list-none">
            {filtered.length === 0 ? (
              <li className="px-1.5 text-sm text-ink-3">No projects yet.</li>
            ) : (
              filtered.map((p) => {
                const isActive = activeProject?.id === p.id
                const tickHue = hueFromString(p.id)
                return (
                  <li key={p.id}>
                    <NavLink
                      to={`/projects/${p.id}`}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[9px] text-left transition ${
                        isActive
                          ? 'bg-accent-soft'
                          : 'hover:bg-surface-2'
                      }`}
                    >
                      <span
                        className="w-[3px] self-stretch rounded-[2px] flex-shrink-0"
                        style={{
                          background: `oklch(0.70 0.16 ${tickHue})`,
                        }}
                      />
                      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span
                          className={`font-medium text-[13.5px] truncate ${
                            isActive ? 'text-accent-ink' : 'text-ink'
                          }`}
                        >
                          {p.name}
                        </span>
                        <span className="text-[11px] text-ink-3">
                          {p.participants.length} people
                        </span>
                      </span>
                    </NavLink>
                  </li>
                )
              })
            )}
          </ul>
        </div>

        {/* Activity (placeholder until wired) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-3">
            <span>Activity</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-status normal-case tracking-normal">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-status animate-ma-pulse" />
              live
            </span>
          </div>
          <p className="px-1.5 text-[12px] text-ink-3">
            Recent updates will appear here.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center gap-2.5 p-2.5 border-t border-line">
          <Avatar person={{ id: 'me', name: 'You' }} size={28} />
          <div className="flex-1 min-w-0">
            <p className="m-0 text-[12.5px] font-semibold text-ink truncate">
              You
            </p>
            <p className="m-0 text-[11px] text-ink-3 truncate">
              meeting → action
            </p>
          </div>
        </div>
      </aside>

      <main className="overflow-y-auto relative">
        <div className="topbar-blur sticky top-0 z-10 flex items-center justify-between border-b border-line px-9 py-4">
          <Breadcrumbs activeProject={activeProject} />
        </div>
        <div className="mx-auto max-w-[1100px] px-9 py-7 flex flex-col gap-7">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function Breadcrumbs({ activeProject }: { activeProject: Project | null }) {
  const params = useParams()
  const location = useLocation()
  const pathname = location.pathname

  let trail: string | null = null
  if (params.meetingId) {
    if (pathname.endsWith('/confirm')) trail = 'Speakers'
    else if (pathname.endsWith('/draft')) trail = 'Draft review'
    else if (pathname.endsWith('/dispatch')) trail = 'Dispatch'
    else if (pathname.endsWith('/new')) trail = 'New meeting'
    else trail = 'Meeting'
  } else if (pathname.endsWith('/team')) {
    trail = 'Team'
  } else if (pathname.includes('/me')) {
    trail = 'My tasks'
  } else if (pathname === '/projects/new') {
    trail = 'New project'
  }

  return (
    <div className="flex items-center gap-2 text-[13px] text-ink-3">
      <Link to="/" className="hover:text-ink transition">
        Workspace
      </Link>
      {activeProject && (
        <>
          <span className="text-ink-3">/</span>
          <Link
            to={`/projects/${activeProject.id}`}
            className="text-ink font-semibold hover:text-accent transition"
          >
            {activeProject.name}
          </Link>
        </>
      )}
      {trail && (
        <>
          <span className="text-ink-3">/</span>
          <span className="text-ink-2">{trail}</span>
        </>
      )}
    </div>
  )
}
