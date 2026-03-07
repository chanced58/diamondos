'use client';
import type { JSX } from 'react';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export type CalendarEvent = {
  id: string;
  type: 'game' | 'practice' | 'event';
  title: string;
  /** 'YYYY-MM-DD' in local calendar time */
  dateKey: string;
  /** Display time string, e.g. "3:30 PM" */
  time: string;
  /** Detail page URL */
  url: string;
  /** Secondary label, e.g. "vs Central High" or "@ Field House" */
  detail?: string;
};

type Props = {
  year: number;
  /** 1-indexed month */
  month: number;
  events: CalendarEvent[];
  isCoach: boolean;
  teamId: string;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_STYLES = {
  game:     { chip: 'bg-blue-50 text-blue-700 border-blue-200',   dot: 'bg-blue-500',   icon: '⚾', label: 'Game' },
  practice: { chip: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500',  icon: '🏋️', label: 'Practice' },
  event:    { chip: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500', icon: '📅', label: 'Event' },
};

export function CalendarView({ year, month, events, isCoach: _isCoach, teamId: _teamId }: Props): JSX.Element | null {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Build grid cells (null = padding cell before month start)
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Group events by day
  const eventsByDay = new Map<number, CalendarEvent[]>();
  for (const ev of events) {
    const day = parseInt(ev.dateKey.split('-')[2], 10);
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day)!.push(ev);
  }

  function prevMonth() {
    let m = month - 1, y = year;
    if (m < 1) { m = 12; y--; }
    router.push(`/games?month=${y}-${String(m).padStart(2, '0')}`);
  }

  function nextMonth() {
    let m = month + 1, y = year;
    if (m > 12) { m = 1; y++; }
    router.push(`/games?month=${y}-${String(m).padStart(2, '0')}`);
  }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDate = isCurrentMonth ? today.getDate() : -1;

  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : null;

  // Events for the full month sorted by date then time, for the list below
  const allMonthEvents = [...events].sort((a, b) =>
    a.dateKey === b.dateKey ? a.time.localeCompare(b.time) : a.dateKey.localeCompare(b.dateKey),
  );

  return (
    <div>
      {/* ── Month navigation ───────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          aria-label="Previous month"
        >
          ←
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {/* ── Calendar grid ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {DAY_LABELS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 divide-x divide-gray-100">
          {cells.map((day, i) => {
            const dayEvents = day ? (eventsByDay.get(day) ?? []) : [];
            const isSelected = day === selectedDay;
            const isToday = day === todayDate;
            const isWeekEnd = i % 7 === 0;

            return (
              <div
                key={i}
                onClick={() => day && setSelectedDay(isSelected ? null : day)}
                className={[
                  'min-h-[80px] p-1.5 border-b border-gray-100 transition-colors',
                  day ? 'cursor-pointer' : '',
                  isSelected ? 'bg-brand-50' : day ? 'hover:bg-gray-50' : 'bg-gray-50/50',
                  isWeekEnd && day ? 'bg-gray-50/80' : '',
                ].filter(Boolean).join(' ')}
              >
                {day && (
                  <>
                    {/* Day number */}
                    <span
                      className={[
                        'inline-flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full mb-1',
                        isToday
                          ? 'bg-brand-700 text-white'
                          : isSelected
                          ? 'text-brand-700'
                          : 'text-gray-600',
                      ].join(' ')}
                    >
                      {day}
                    </span>

                    {/* Event chips */}
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${TYPE_STYLES[ev.type].chip}`}
                        >
                          {TYPE_STYLES[ev.type].icon} {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-gray-400 px-1">
                          +{dayEvents.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        {Object.entries(TYPE_STYLES).map(([type, s]) => (
          <span key={type} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        ))}
      </div>

      {/* ── Day detail panel ──────────────────────────────────── */}
      {selectedDay !== null && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              {MONTH_NAMES[month - 1]} {selectedDay}
            </h3>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Close ✕
            </button>
          </div>

          {selectedEvents && selectedEvents.length === 0 ? (
            <div className="px-5 py-6 text-center text-gray-400 text-sm">
              No events on this day.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {selectedEvents?.map((ev) => (
                <li key={ev.id}>
                  <Link
                    href={ev.url}
                    className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-lg mt-0.5">{TYPE_STYLES[ev.type].icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
                      {ev.detail && (
                        <p className="text-xs text-gray-500 truncate">{ev.detail}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{ev.time}</p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_STYLES[ev.type].chip}`}
                    >
                      {TYPE_STYLES[ev.type].label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Full month list (shown when no day selected) ──────── */}
      {selectedDay === null && allMonthEvents.length > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">
              All events — {MONTH_NAMES[month - 1]} {year}
            </h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {allMonthEvents.map((ev) => {
              const day = parseInt(ev.dateKey.split('-')[2], 10);
              return (
                <li key={ev.id}>
                  <Link
                    href={ev.url}
                    className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="shrink-0 w-10 text-center">
                      <p className="text-xs text-gray-400">{MONTH_NAMES[month - 1].slice(0, 3)}</p>
                      <p className="text-base font-bold text-gray-900 leading-tight">{day}</p>
                    </div>
                    <span className="text-lg mt-1">{TYPE_STYLES[ev.type].icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ev.title}</p>
                      {ev.detail && (
                        <p className="text-xs text-gray-500 truncate">{ev.detail}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">{ev.time}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {selectedDay === null && allMonthEvents.length === 0 && (
        <div className="mt-4 bg-white rounded-xl border border-gray-100 px-5 py-10 text-center text-gray-400 text-sm">
          No events scheduled for {MONTH_NAMES[month - 1]} {year}.
        </div>
      )}
    </div>
  );
}
