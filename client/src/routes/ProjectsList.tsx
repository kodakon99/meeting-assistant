import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Project } from '../lib/types'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { hueFromString } from '../components/ui/hue'
import { AvatarStack } from '../components/ui/Avatar'

export function ProjectsList() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="m-0 text-[26px] font-semibold tracking-tight text-ink">
            Projects
          </h1>
          <p className="mt-1 m-0 text-[13px] text-ink-3">
            All workspaces you've captured meetings for.
          </p>
        </div>
        <Link to="/projects/new">
          <Button>+ New project</Button>
        </Link>
      </div>

      {error && (
        <p className="rounded-card bg-[oklch(0.95_0.05_18)] p-3 text-[13px] text-rose-status">
          {error}
        </p>
      )}

      {projects === null && !error ? (
        <p className="text-ink-3">Loading…</p>
      ) : projects && projects.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-ink-2">
            No projects yet. Create your first one to get started.
          </p>
          <Link to="/projects/new" className="mt-4 inline-block">
            <Button>Create a project</Button>
          </Link>
        </Card>
      ) : (
        <ul
          className="grid gap-3 m-0 p-0 list-none"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {projects?.map((p, i) => {
            const hue = hueFromString(p.id)
            return (
              <li
                key={p.id}
                className="animate-ma-fade-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <Link to={`/projects/${p.id}`} className="block group">
                  <Card interactive className="p-4 flex flex-col gap-3 h-full">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-1 h-8 rounded-[2px] flex-shrink-0"
                        style={{ background: `oklch(0.70 0.16 ${hue})` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 font-semibold text-[14.5px] text-ink truncate group-hover:text-accent-ink transition-colors">
                          {p.name}
                        </p>
                        <p className="m-0 mt-0.5 text-[12px] text-ink-3">
                          {p.participants.length}{' '}
                          {p.participants.length === 1
                            ? 'participant'
                            : 'participants'}
                        </p>
                      </div>
                    </div>
                    {p.participants.length > 0 && (
                      <AvatarStack
                        people={p.participants.map((x) => ({
                          id: x.id,
                          name: x.name,
                        }))}
                        size={24}
                        max={5}
                      />
                    )}
                    <p className="m-0 text-[11px] text-ink-3 mt-auto">
                      Created {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                  </Card>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
