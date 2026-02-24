import { useState } from 'react';
import type { CollectionStats as Stats } from '../../../shared/types';

interface CollectionStatsProps {
  stats: Stats | null;
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function CollectionStats({ stats }: CollectionStatsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!stats) {
    return (
      <div className="h-12 bg-white border border-gray-200 rounded-xl animate-pulse" />
    );
  }

  const brandEntries = Object.entries(stats.by_brand).sort((a, b) => b[1].value - a[1].value);
  const locationEntries = Object.entries(stats.by_location).sort((a, b) => b[1].count - a[1].count);
  const typeEntries = Object.entries(stats.by_type).sort((a, b) => b[1].count - a[1].count);

  return (
    <div>
      {/* Compact summary bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{stats.total_shoes}</span>
            <span className="text-sm text-gray-400">shoes</span>
          </div>
          <div className="hidden md:block w-px h-6 bg-gray-200" />
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600">
              {formatPrice(stats.total_value)}
            </span>
            <span className="text-sm text-gray-400">total value</span>
          </div>
          <div className="hidden md:block w-px h-6 bg-gray-200" />
          <div className="flex items-center gap-4 text-sm text-gray-500">
            {typeEntries.map(([type, data]) => (
              <span key={type}>
                <span className="text-gray-700 font-medium">{data.count}</span>{' '}
                {type === 'Boxed Shoes' ? 'boxed' : 'boxless'}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
        >
          {expanded ? 'Hide' : 'Breakdown'}
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expandable breakdown */}
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          {/* By Brand */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              By Brand
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {brandEntries.map(([brand, data]) => (
                <div key={brand} className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-gray-700">{brand}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-xs">{data.count}</span>
                    <span className="text-emerald-600 text-xs tabular-nums w-16 text-right font-mono">
                      {formatPrice(data.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By Type */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              By Type
            </p>
            <div className="space-y-1.5">
              {typeEntries.map(([type, data]) => {
                const pct = Math.round((data.count / stats.total_shoes) * 100);
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{type}</span>
                      <span className="text-gray-400 text-xs">{data.count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500/50 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* By Location */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
              By Location
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {locationEntries.map(([location, data]) => (
                <div key={location} className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-gray-700 truncate mr-2">{location}</span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-gray-400 text-xs">{data.count}</span>
                    <span className="text-emerald-600 text-xs tabular-nums w-16 text-right font-mono">
                      {formatPrice(data.value)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
