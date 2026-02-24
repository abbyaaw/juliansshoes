import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Shoe, CollectionStats as StatsType } from '../../../shared/types';
import { fetchShoes, fetchStats, type ShoeFilters } from '../lib/api';
import CollectionStats from '../components/CollectionStats';

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '—';
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Sort key can be "field" (asc) or "-field" (desc)
function parseSortKey(sort: string | undefined): { field: string; desc: boolean } | null {
  if (!sort) return null;
  if (sort.startsWith('-')) return { field: sort.slice(1), desc: true };
  return { field: sort, desc: false };
}

function SortArrow({ field, currentSort }: { field: string; currentSort: string | undefined }) {
  const parsed = parseSortKey(currentSort);
  if (!parsed || parsed.field !== field) {
    return <span className="text-gray-300 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">&#8597;</span>;
  }
  return (
    <span className="text-emerald-500 ml-1">
      {parsed.desc ? '\u2193' : '\u2191'}
    </span>
  );
}

export default function Collection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [stats, setStats] = useState<StatsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derive filters from URL search params
  const filters: ShoeFilters = useMemo(() => ({
    search: searchParams.get('search') || undefined,
    brand: searchParams.get('brand') || undefined,
    type: searchParams.get('type') || undefined,
    location: searchParams.get('location') || undefined,
    sub_location: searchParams.get('sub_location') || undefined,
    status: searchParams.get('status') || undefined,
    sort: searchParams.get('sort') || undefined,
  }), [searchParams]);

  const setFilters = useCallback((newFilters: ShoeFilters) => {
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [shoesData, statsData] = await Promise.all([fetchShoes(), fetchStats()]);
        setShoes(shoesData);
        setStats(statsData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load collection');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Extract unique values for filter dropdowns
  const brands = useMemo(() => {
    const set = new Set<string>();
    shoes.forEach((s) => s.brand && set.add(s.brand));
    return Array.from(set).sort();
  }, [shoes]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    shoes.forEach((s) => s.location && set.add(s.location));
    return Array.from(set).sort();
  }, [shoes]);

  // Sub-locations depend on selected location
  const subLocations = useMemo(() => {
    const set = new Set<string>();
    const filtered = filters.location
      ? shoes.filter((s) => s.location === filters.location)
      : shoes;
    filtered.forEach((s) => s.sub_location && set.add(s.sub_location));
    return Array.from(set).sort();
  }, [shoes, filters.location]);

  // Apply client-side filters
  const filteredShoes = useMemo(() => {
    let result = [...shoes];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (s) =>
          s.brand?.toLowerCase().includes(q) ||
          s.model?.toLowerCase().includes(q) ||
          s.colorway?.toLowerCase().includes(q) ||
          s.image_filename.toLowerCase().includes(q)
      );
    }

    if (filters.brand) {
      result = result.filter((s) => s.brand === filters.brand);
    }

    if (filters.type) {
      result = result.filter((s) => s.type?.includes(filters.type!) && (filters.type !== 'Boxed' || !s.type?.includes('Boxless')));
    }

    if (filters.location) {
      result = result.filter((s) => s.location === filters.location);
    }

    if (filters.sub_location) {
      result = result.filter((s) => s.sub_location === filters.sub_location);
    }

    if (filters.status) {
      switch (filters.status) {
        case 'identified':
          result = result.filter((s) => s.identified);
          break;
        case 'unidentified':
          result = result.filter((s) => !s.identified);
          break;
        case 'priced':
          result = result.filter((s) => s.my_price !== null);
          break;
        case 'unpriced':
          result = result.filter((s) => s.my_price === null);
          break;
      }
    }

    const parsed = parseSortKey(filters.sort);
    if (parsed) {
      const { field, desc } = parsed;
      const dir = desc ? -1 : 1;
      switch (field) {
        case 'brand':
          result.sort((a, b) => dir * (a.brand || '').localeCompare(b.brand || ''));
          break;
        case 'model':
          result.sort((a, b) => dir * (a.model || '').localeCompare(b.model || ''));
          break;
        case 'colorway':
          result.sort((a, b) => dir * (a.colorway || '').localeCompare(b.colorway || ''));
          break;
        case 'size':
          result.sort((a, b) => dir * (parseFloat(a.size || '0') - parseFloat(b.size || '0')));
          break;
        case 'type':
          result.sort((a, b) => dir * (a.type || '').localeCompare(b.type || ''));
          break;
        case 'location':
          result.sort((a, b) => dir * (a.location || '').localeCompare(b.location || ''));
          break;
        case 'sub_location':
          result.sort((a, b) => dir * (a.sub_location || '').localeCompare(b.sub_location || ''));
          break;
        case 'price':
          result.sort((a, b) => dir * ((a.my_price || 0) - (b.my_price || 0)));
          break;
      }
    }

    return result;
  }, [shoes, filters]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-md">
          <p className="text-red-600 font-medium">Error loading collection</p>
          <p className="text-red-400 text-sm mt-1">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm text-red-600 hover:text-red-500 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const toggleSort = useCallback((field: string) => {
    const parsed = parseSortKey(filters.sort);
    if (parsed && parsed.field === field) {
      // Same field: toggle asc → desc → clear
      if (!parsed.desc) {
        setFilters({ ...filters, sort: `-${field}` });
      } else {
        setFilters({ ...filters, sort: undefined });
      }
    } else {
      // New field: start ascending
      setFilters({ ...filters, sort: field });
    }
  }, [filters, setFilters]);

  const hasFilters = filters.search || filters.brand || filters.type || filters.location || filters.sub_location || filters.status;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = [filters.brand, filters.type, filters.location, filters.sub_location, filters.status].filter(Boolean).length;

  const selectClass =
    'bg-white border border-gray-200 text-sm text-gray-900 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 appearance-none cursor-pointer hover:border-gray-300 transition-colors w-full';

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <CollectionStats stats={stats} />

      {/* Table card with integrated filters */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden">
        {/* Search + filter bar inside the table card */}
        <div className="p-3 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={filters.search || ''}
                onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
                className="w-full bg-gray-50/80 border-0 text-sm text-gray-900 rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder-gray-400"
              />
            </div>
            {!loading && (
              <span className="text-xs text-gray-400 hidden sm:block flex-shrink-0">
                {filteredShoes.length === shoes.length
                  ? `${shoes.length} shoes`
                  : `${filteredShoes.length} of ${shoes.length}`}
              </span>
            )}
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors flex-shrink-0 ${
                activeFilterCount > 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-emerald-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Expandable filter dropdowns */}
          {filtersOpen && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select
                value={filters.brand || ''}
                onChange={(e) => setFilters({ ...filters, brand: e.target.value || undefined })}
                className={selectClass}
              >
                <option value="">All Brands</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select
                value={filters.type || ''}
                onChange={(e) => setFilters({ ...filters, type: e.target.value || undefined })}
                className={selectClass}
              >
                <option value="">Boxed / Boxless</option>
                <option value="Boxed">Boxed Only</option>
                <option value="Boxless">Boxless Only</option>
              </select>
              <select
                value={filters.location || ''}
                onChange={(e) => {
                  const newLoc = e.target.value || undefined;
                  setFilters({ ...filters, location: newLoc, sub_location: newLoc !== filters.location ? undefined : filters.sub_location });
                }}
                className={selectClass}
              >
                <option value="">All Locations</option>
                {locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              {subLocations.length > 0 ? (
                <select
                  value={filters.sub_location || ''}
                  onChange={(e) => setFilters({ ...filters, sub_location: e.target.value || undefined })}
                  className={selectClass}
                >
                  <option value="">All Sub-Loc</option>
                  {subLocations.map((sl) => <option key={sl} value={sl}>{sl}</option>)}
                </select>
              ) : (
                <select
                  value={filters.status || ''}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                  className={selectClass}
                >
                  <option value="">All Status</option>
                  <option value="identified">Identified</option>
                  <option value="unidentified">Unidentified</option>
                  <option value="priced">Priced</option>
                  <option value="unpriced">Unpriced</option>
                </select>
              )}
              {subLocations.length > 0 && (
                <select
                  value={filters.status || ''}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                  className={selectClass}
                >
                  <option value="">All Status</option>
                  <option value="identified">Identified</option>
                  <option value="unidentified">Unidentified</option>
                  <option value="priced">Priced</option>
                  <option value="unpriced">Unpriced</option>
                </select>
              )}
              {hasFilters && (
                <button
                  onClick={() => { setFilters({}); setFiltersOpen(false); }}
                  className="text-xs text-emerald-600 hover:text-emerald-500 transition-colors col-span-2 md:col-span-1 py-2"
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          {/* Clear filters link (mobile or when filters panel closed) */}
          {!loading && hasFilters && !filtersOpen && (
            <div className="flex items-center justify-end text-xs">
              <button
                onClick={() => setFilters({})}
                className="text-emerald-600 hover:text-emerald-500"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Data table */}
        {loading ? (
          <div className="animate-pulse">
            <div className="h-10 bg-gray-100 border-b border-gray-200" />
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 border-b border-gray-100 flex items-center gap-4 px-3">
                <div className="h-3 bg-gray-100 rounded w-24" />
                <div className="h-3 bg-gray-100 rounded w-32" />
                <div className="h-3 bg-gray-100 rounded w-12" />
              </div>
            ))}
          </div>
        ) : filteredShoes.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-400">No shoes found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  {/* Mobile: combined Shoe column. Desktop: separate Brand + Model */}
                  <th
                    onClick={() => toggleSort('brand')}
                    className="md:hidden text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none hover:text-gray-700 group"
                  >
                    Shoe<SortArrow field="brand" currentSort={filters.sort} />
                  </th>
                  <th
                    onClick={() => toggleSort('brand')}
                    className="hidden md:table-cell text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none hover:text-gray-700 group"
                  >
                    Brand<SortArrow field="brand" currentSort={filters.sort} />
                  </th>
                  <th
                    onClick={() => toggleSort('model')}
                    className="hidden md:table-cell text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none hover:text-gray-700 group"
                  >
                    Model<SortArrow field="model" currentSort={filters.sort} />
                  </th>
                  <th
                    onClick={() => toggleSort('colorway')}
                    className="hidden lg:table-cell text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none hover:text-gray-700 group"
                  >
                    Colorway<SortArrow field="colorway" currentSort={filters.sort} />
                  </th>
                  <th
                    onClick={() => toggleSort('size')}
                    className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none hover:text-gray-700 group w-16"
                  >
                    Size<SortArrow field="size" currentSort={filters.sort} />
                  </th>
                  <th
                    onClick={() => toggleSort('type')}
                    className="hidden lg:table-cell text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none hover:text-gray-700 group"
                  >
                    Type<SortArrow field="type" currentSort={filters.sort} />
                  </th>
                  <th
                    onClick={() => toggleSort('location')}
                    className="hidden md:table-cell text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none hover:text-gray-700 group"
                  >
                    Location<SortArrow field="location" currentSort={filters.sort} />
                  </th>
                  <th
                    onClick={() => toggleSort('price')}
                    className="text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-2.5 cursor-pointer select-none hover:text-gray-700 group w-20"
                  >
                    Price<SortArrow field="price" currentSort={filters.sort} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredShoes.map((shoe) => (
                  <tr
                    key={shoe.id}
                    onClick={() => navigate(`/shoes/${shoe.id}`)}
                    className="border-b border-gray-100 cursor-pointer transition-colors hover:bg-gray-50 active:bg-gray-100"
                  >
                    {/* Mobile: combined Brand + Model cell */}
                    <td className="md:hidden px-3 py-3">
                      <div className="text-sm font-medium text-gray-900 truncate max-w-[45vw]">
                        {shoe.model || shoe.image_filename}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {shoe.brand || '—'}
                      </div>
                    </td>
                    {/* Desktop: separate Brand */}
                    <td className="hidden md:table-cell px-3 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {shoe.brand || '—'}
                    </td>
                    {/* Desktop: separate Model */}
                    <td className="hidden md:table-cell px-3 py-3 text-sm text-gray-700 max-w-[200px] truncate">
                      {shoe.model || shoe.image_filename}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-sm text-gray-500 max-w-[150px] truncate">
                      {shoe.colorway || '—'}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {shoe.size || '—'}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-3 text-sm whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-xs ${
                        shoe.type?.includes('Boxed') && !shoe.type?.includes('Boxless')
                          ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          shoe.type?.includes('Boxed') && !shoe.type?.includes('Boxless')
                            ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                        {shoe.type?.includes('Boxed') && !shoe.type?.includes('Boxless') ? 'Boxed' : 'Boxless'}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {shoe.location || '—'}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      {shoe.my_price !== null && shoe.my_price > 0 ? (
                        <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                          {formatPrice(shoe.my_price)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
