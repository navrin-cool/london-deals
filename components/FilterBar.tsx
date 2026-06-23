'use client'

import { DayOfWeek } from '@/types'

type Day = { key: DayOfWeek | 'all'; label: string; short: string; activeClass: string }

const DAYS: Day[] = [
  { key: 'all',       label: 'All Days',  short: 'All', activeClass: 'bg-slate-500 text-white' },
  { key: 'monday',    label: 'Monday',    short: 'Mon', activeClass: 'bg-blue-600 text-white' },
  { key: 'tuesday',   label: 'Tuesday',   short: 'Tue', activeClass: 'bg-violet-600 text-white' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed', activeClass: 'bg-emerald-600 text-white' },
  { key: 'thursday',  label: 'Thursday',  short: 'Thu', activeClass: 'bg-orange-600 text-white' },
  { key: 'friday',    label: 'Friday',    short: 'Fri', activeClass: 'bg-red-600 text-white' },
  { key: 'saturday',  label: 'Saturday',  short: 'Sat', activeClass: 'bg-pink-600 text-white' },
  { key: 'sunday',    label: 'Sunday',    short: 'Sun', activeClass: 'bg-yellow-500 text-slate-900' },
]

interface Props {
  selectedDay: DayOfWeek | 'all'
  onDayChange: (day: DayOfWeek | 'all') => void
}

export default function FilterBar({ selectedDay, onDayChange }: Props) {
  return (
    <div className="p-3 border-b border-slate-800 flex-shrink-0">
      <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-medium">
        Filter by day
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((day) => (
          <button
            key={day.key}
            onClick={() => onDayChange(day.key)}
            title={day.label}
            className={`
              px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-150
              ${selectedDay === day.key
                ? `${day.activeClass} ring-2 ring-white/20 shadow-md scale-105`
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }
            `}
          >
            {day.short}
          </button>
        ))}
      </div>
    </div>
  )
}
