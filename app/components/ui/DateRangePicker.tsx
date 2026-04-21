'use client';

interface DateRangePickerProps {
  value: number;
  onChange: (days: number) => void;
}

const PRESETS = [
  { label: '1일', days: 1 },
  { label: '3일', days: 3 },
  { label: '7일', days: 7 },
  { label: '14일', days: 14 },
  { label: '30일', days: 30 },
  { label: '60일', days: 60 },
  { label: '90일', days: 90 },
];

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-1">
      {PRESETS.map((preset) => (
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
  );
}
