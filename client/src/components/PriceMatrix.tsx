import type { PriceSource } from '../../../shared/types';

interface PriceMatrixProps {
  sources: PriceSource[];
  shoeType: string | null;
  onSelectPrice: (price: number) => void;
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function conditionLabel(shoe: string | null, box: string | null): string {
  const parts: string[] = [];
  if (shoe) parts.push(shoe);
  if (box && box !== 'Missing') parts.push(`${box} box`);
  else if (box === 'Missing') parts.push('No box');
  return parts.join(' · ') || 'Unknown';
}

function conditionColor(condition: string | null): string {
  switch (condition) {
    case 'New/DS': return 'bg-emerald-50 text-emerald-700';
    case 'Excellent': return 'bg-blue-50 text-blue-700';
    case 'Good': return 'bg-amber-50 text-amber-700';
    case 'Fair': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-50 text-gray-500';
  }
}

// Source favicon / brand color
function sourceColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('stockx')) return 'text-emerald-600';
  if (n.includes('goat')) return 'text-purple-600';
  if (n.includes('ebay')) return 'text-blue-600';
  if (n.includes('flight club')) return 'text-red-600';
  if (n.includes('grailed')) return 'text-rose-600';
  if (n.includes('nike')) return 'text-orange-600';
  if (n.includes('amazon')) return 'text-yellow-600';
  return 'text-gray-500';
}

export default function PriceMatrix({ sources, onSelectPrice }: PriceMatrixProps) {
  if (sources.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <div className="text-gray-300 mb-2">
          <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-400 text-sm">No price sources yet</p>
        <p className="text-gray-300 text-xs mt-1">Click "Research Prices" above to find market prices</p>
      </div>
    );
  }

  // Sort by price ascending
  const sorted = [...sources].sort((a, b) => a.price - b.price);
  const low = sorted[0].price;
  const high = sorted[sorted.length - 1].price;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Price Sources</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {sources.length} source{sources.length !== 1 ? 's' : ''} found
            {low !== high && (
              <span> · {formatPrice(low)} – {formatPrice(high)}</span>
            )}
          </p>
        </div>
        <p className="text-[10px] text-gray-400">Click a price to use it</p>
      </div>

      <div className="divide-y divide-gray-100">
        {sorted.map((src) => (
          <button
            key={src.id}
            onClick={() => onSelectPrice(src.price)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left group"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Source name */}
              <span className={`text-sm font-medium w-24 flex-shrink-0 ${sourceColor(src.source_name)}`}>
                {src.source_name}
              </span>
              {/* Condition badge */}
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${conditionColor(src.shoe_condition)}`}>
                {conditionLabel(src.shoe_condition, src.box_condition)}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Price */}
              <span className="text-base font-bold text-gray-900 tabular-nums font-mono group-hover:text-emerald-600 transition-colors">
                {formatPrice(src.price)}
              </span>
              {/* External link icon */}
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-gray-300 hover:text-gray-600 transition-colors"
                title={`Open on ${src.source_name}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
