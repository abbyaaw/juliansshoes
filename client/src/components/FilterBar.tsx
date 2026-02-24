import type { ShoeFilters } from '../lib/api';

interface FilterBarProps {
  filters: ShoeFilters;
  onChange: (filters: ShoeFilters) => void;
  brands: string[];
  locations: string[];
  subLocations: string[];
}

export default function FilterBar({ filters, onChange, brands, locations, subLocations }: FilterBarProps) {
  const update = (partial: Partial<ShoeFilters>) => {
    // If location changes, clear sub_location
    if ('location' in partial && partial.location !== filters.location) {
      partial.sub_location = undefined;
    }
    onChange({ ...filters, ...partial });
  };

  const selectClass =
    'bg-white border border-gray-200 text-sm text-gray-900 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer hover:border-gray-300 transition-colors';

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search brand, model, colorway..."
          value={filters.search || ''}
          onChange={(e) => update({ search: e.target.value })}
          className="w-full bg-white border border-gray-200 text-sm text-gray-900 rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder-gray-400 hover:border-gray-300 transition-colors"
        />
      </div>

      {/* Brand */}
      <select
        value={filters.brand || ''}
        onChange={(e) => update({ brand: e.target.value || undefined })}
        className={selectClass}
      >
        <option value="">All Brands</option>
        {brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      {/* Type */}
      <select
        value={filters.type || ''}
        onChange={(e) => update({ type: e.target.value || undefined })}
        className={selectClass}
      >
        <option value="">All Types</option>
        <option value="Boxed">Boxed</option>
        <option value="Boxless">Boxless</option>
      </select>

      {/* Location */}
      <select
        value={filters.location || ''}
        onChange={(e) => update({ location: e.target.value || undefined })}
        className={selectClass}
      >
        <option value="">All Locations</option>
        {locations.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>

      {/* Sub-Location (only show when there are sub-locations for selected location) */}
      {subLocations.length > 0 && (
        <select
          value={filters.sub_location || ''}
          onChange={(e) => update({ sub_location: e.target.value || undefined })}
          className={selectClass}
        >
          <option value="">All Sub-Locations</option>
          {subLocations.map((sl) => (
            <option key={sl} value={sl}>
              {sl}
            </option>
          ))}
        </select>
      )}

      {/* Status */}
      <select
        value={filters.status || ''}
        onChange={(e) => update({ status: e.target.value || undefined })}
        className={selectClass}
      >
        <option value="">All Status</option>
        <option value="identified">Identified</option>
        <option value="unidentified">Unidentified</option>
        <option value="priced">Priced</option>
        <option value="unpriced">Unpriced</option>
      </select>

      {/* Sort — hidden on mobile (use column headers instead) */}
      <select
        value={filters.sort || ''}
        onChange={(e) => update({ sort: e.target.value || undefined })}
        className={`hidden md:block ${selectClass}`}
      >
        <option value="">Sort: Date Added</option>
        <option value="brand">Sort: Brand A-Z</option>
        <option value="-brand">Sort: Brand Z-A</option>
        <option value="model">Sort: Model A-Z</option>
        <option value="-model">Sort: Model Z-A</option>
        <option value="size">Sort: Size Low-High</option>
        <option value="-size">Sort: Size High-Low</option>
        <option value="price">Sort: Price Low-High</option>
        <option value="-price">Sort: Price High-Low</option>
      </select>
    </div>
  );
}
