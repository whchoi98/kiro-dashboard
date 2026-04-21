'use client';

import { useState } from 'react';

interface DateRangePickerProps {
  value: number;
  onChange: (days: number) => void;
}

const DAY_PRESETS = [
  { label: '1일', days: 1 },
  { label: '3일', days: 3 },
  { label: '7일', days: 7 },
  { label: '14일', days: 14 },
  { label: '30일', days: 30 },
  { label: '60일', days: 60 },
  { label: '90일', days: 90 },
];

const HOUR_PRESETS = [
  { label: '1분', hours: 1 / 60 },
  { label: '5분', hours: 5 / 60 },
  { label: '10분', hours: 10 / 60 },
  { label: '1시간', hours: 1 },
  { label: '3시간', hours: 3 },
  { label: '6시간', hours: 6 },
  { label: '12시간', hours: 12 },
];

function hoursToDays(hours: number): number {
  return Math.max(hours / 24, 1 / 1440);
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [showHours, setShowHours] = useState(false);

  const isHourValue = value < 1;

  return (
    <div className="flex items-center gap-1.5">
      {/* Clock icon toggle for hour presets */}
      <button
        onClick={() => setShowHours(!showHours)}
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-200 ${
          showHours
            ? 'bg-[#9046FF] text-white shadow-lg shadow-purple-500/30'
            : 'bg-gray-900/50 border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600'
        }`}
        title={showHours ? '일 단위로 전환' : '시간/분 단위로 전환'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </button>

      {showHours ? (
        /* Hour/minute presets */
        <div className="flex items-center gap-1">
          {HOUR_PRESETS.map((preset) => {
            const dayVal = hoursToDays(preset.hours);
            const isActive = isHourValue && Math.abs(value - dayVal) < 0.0001;
            return (
              <button
                key={preset.label}
                onClick={() => onChange(dayVal)}
                className={`px-2 py-1 rounded-full text-xs font-medium transition-colors duration-150 whitespace-nowrap ${
                  isActive
                    ? 'bg-[#9046FF] text-white'
                    : 'bg-gray-900/50 border border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : (
        /* Day presets */
        <div className="flex items-center gap-1">
          {DAY_PRESETS.map((preset) => (
            <button
              key={preset.days}
              onClick={() => onChange(preset.days)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150 ${
                value === preset.days
                  ? 'bg-[#9046FF] text-white'
                  : 'bg-gray-900/50 border border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
