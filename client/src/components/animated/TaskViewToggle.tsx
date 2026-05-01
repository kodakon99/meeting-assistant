import { useState } from 'react'
import type { Task, TaskStatus } from '../../lib/types'
import { TaskGraph } from './TaskGraph'
import { TaskList } from './TaskList'

type View = 'graph' | 'list'

type Props = {
  tasks: Task[]
  onToggleDone?: (id: string, nextStatus: TaskStatus) => void
}

export function TaskViewToggle({ tasks, onToggleDone }: Props) {
  const [view, setView] = useState<View>('graph')
  const [focusId, setFocusId] = useState<string | null>(null)

  return (
    <section className="flex flex-col gap-3.5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-[17px] font-semibold tracking-tight text-ink">
            Task graph
          </h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-ink-3">
            Hover a node to trace its dependency chain.
          </p>
        </div>
        <div className="relative inline-flex bg-surface-2 rounded-btn p-[3px] border border-line">
          <span
            className="absolute top-[3px] bottom-[3px] left-[3px] bg-surface rounded-[7px] shadow-sm transition-transform duration-[250ms] ease-spring"
            style={{
              width: 'calc(50% - 3px)',
              transform: view === 'list' ? 'translateX(100%)' : 'translateX(0)',
            }}
          />
          <button
            className={`relative z-[1] inline-flex items-center gap-1.5 bg-transparent border-0 cursor-pointer font-semibold text-[12.5px] px-3 py-1.5 rounded-[7px] transition-colors ${
              view === 'graph' ? 'text-ink' : 'text-ink-3'
            }`}
            onClick={() => setView('graph')}
          >
            Graph
          </button>
          <button
            className={`relative z-[1] inline-flex items-center gap-1.5 bg-transparent border-0 cursor-pointer font-semibold text-[12.5px] px-3 py-1.5 rounded-[7px] transition-colors ${
              view === 'list' ? 'text-ink' : 'text-ink-3'
            }`}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </header>
      <div className="animate-ma-fade-in" key={view}>
        {view === 'graph' ? (
          <TaskGraph tasks={tasks} focusId={focusId} onFocus={setFocusId} />
        ) : (
          <TaskList
            tasks={tasks}
            focusId={focusId}
            onFocus={setFocusId}
            onToggleDone={onToggleDone}
          />
        )}
      </div>
    </section>
  )
}
