import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Shoe, CollectionStats as StatsType } from '../../../shared/types';
import { fetchShoes, fetchStats, type ShoeFilters } from '../lib/api';
import CollectionStats from '../components/CollectionStats';
import FilterBar from '../components/FilterBar';

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
      result = result.filter((s) => s.type === filters.type);
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

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <CollectionStats stats={stats} />

      {/* Filters */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        brands={brands}
        locations={locations}
        subLocations={subLocations}
      />

      {/* Result count */}
      {!loading && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {filteredShoes.length === shoes.length
              ? `${shoes.length} shoes`
              : `${filteredShoes.length} of ${shoes.length} shoes`}
          </p>
          {hasFilters && (
            <button
              onClick={() => setFilters({})}
              className="text-xs text-emerald-600 hover:text-emerald-500 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Data table */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="animate-pulse">
            <div className="h-11 bg-gray-100 border-b border-gray-200" />
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-14 border-b border-gray-100 flex items-center gap-4 px-4">
                <div className="h-3 bg-gray-100 rounded w-16" />
                <div className="h-3 bg-gray-100 rounded w-32" />
                <div className="h-3 bg-gray-100 rounded w-24" />
                <div className="h-3 bg-gray-100 rounded w-12" />
              </div>
            ))}
          </div>
        </div>
      ) : filteredShoes.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <p className="text-gray-400">No shoes found</p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  {([
                    { field: 'brand', label: 'Brand', align: 'left', hideClass: '' },
                    { field: 'model', label: 'Model', align: 'left', hideClass: '' },
                    { field: 'colorway', label: 'Colorway', align: 'left', hideClass: 'hidden lg:table-cell' },
                    { field: 'size', label: 'Size', align: 'left', hideClass: '' },
                    { field: 'type', label: 'Type', align: 'left', hideClass: 'hidden md:table-cell' },
                    { field: 'location', label: 'Location', align: 'left', hideClass: '' },
                    { field: 'sub_location', label: 'Sub-Location', align: 'left', hideClass: 'hidden lg:table-cell' },
                    { field: 'price', label: 'Price', align: 'right', hideClass: '' },
                  ] as const).map(({ field, label, align, hideClass }) => (
                    <th
                      key={field}
                      onClick={() => toggleSort(field)}
                      className={`${hideClass} ${align === 'right' ? 'text-right' : 'text-left'} text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer select-none hover:text-gray-700 hover:bg-gray-100/50 transition-colors group`}
                    >
                      {label}
                      <SortArrow field={field} currentSort={filters.sort} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredShoes.map((shoe, index) => (
                  <tr
                    key={shoe.id}
                    onClick={() => navigate(`/shoes/${shoe.id}`)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors hover:bg-emerald-50/50 hover:border-l-2 hover:border-l-emerald-500 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {shoe.brand || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-[250px] truncate">
                      {shoe.model || shoe.image_filename}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">
                      {shoe.colorway || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">
                      {shoe.size || '—'}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 ${
                        shoe.type?.includes('Boxed') && !shoe.type?.includes('Boxless')
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          shoe.type?.includes('Boxed') && !shoe.type?.includes('Boxless')
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                        }`} />
                        {shoe.type?.includes('Boxed') && !shoe.type?.includes('Boxless') ? 'Boxed' : 'Boxless'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {shoe.location || '—'}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                      {shoe.sub_location || '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {shoe.my_price !== null && shoe.my_price > 0 ? (
                        <span className="text-sm font-bold font-mono text-emerald-600 tabular-nums">
                          {formatPrice(shoe.my_price)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
