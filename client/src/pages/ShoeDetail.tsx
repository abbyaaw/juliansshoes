import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Shoe, PriceSource } from '../../../shared/types';
import {
  fetchShoe,
  updateShoe,
  deleteShoe,
  researchPrices,
  clearPrices,
  startIdentify,
  getImageUrl,
} from '../lib/api';
import PriceMatrix from '../components/PriceMatrix';

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '—';
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ShoeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [shoe, setShoe] = useState<Shoe | null>(null);
  const [sources, setSources] = useState<PriceSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [researching, setResearching] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Editable fields
  const [shoeCondition, setShoeCondition] = useState<string>('');
  const [boxCondition, setBoxCondition] = useState<string>('');
  const [myPrice, setMyPrice] = useState<string>('');

  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        setLoading(true);
        const data = await fetchShoe(parseInt(id));
        setShoe(data.shoe);
        setSources(data.price_sources);
        setShoeCondition(data.shoe.shoe_condition || '');
        setBoxCondition(data.shoe.box_condition || '');
        setMyPrice(data.shoe.my_price !== null ? data.shoe.my_price.toString() : '');
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shoe');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleSave = async () => {
    if (!shoe) return;
    try {
      setSaving(true);
      const data: Partial<Shoe> = {};
      if (shoeCondition) data.shoe_condition = shoeCondition as Shoe['shoe_condition'];
      else data.shoe_condition = null;
      if (boxCondition) data.box_condition = boxCondition as Shoe['box_condition'];
      else data.box_condition = null;
      if (myPrice !== '') {
        data.my_price = parseFloat(myPrice);
      } else {
        data.my_price = null;
      }
      const updated = await updateShoe(shoe.id, data);
      setShoe(updated);
      setMessage('Saved');
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleResearch = async () => {
    if (!shoe) return;
    try {
      setResearching(true);
      setMessage('Researching prices...');
      const result = await researchPrices(shoe.id);
      setSources(result.sources);
      // Reload shoe to get updated my_price
      const reloaded = await fetchShoe(shoe.id);
      setShoe(reloaded.shoe);
      setMyPrice(reloaded.shoe.my_price !== null ? reloaded.shoe.my_price.toString() : '');
      setMessage(`Found ${result.sources.length} price sources`);
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed');
    } finally {
      setResearching(false);
    }
  };

  const handleClearPrices = async () => {
    if (!shoe || !confirm('Clear all price research for this shoe?')) return;
    try {
      await clearPrices(shoe.id);
      setSources([]);
      setMessage('Prices cleared');
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear prices');
    }
  };

  const handleReidentify = () => {
    if (!shoe) return;
    setIdentifying(true);
    setMessage('Re-identifying shoe...');

    const reloadShoe = () => {
      fetchShoe(shoe.id).then((result) => {
        setShoe(result.shoe);
        setSources(result.price_sources);
        setShoeCondition(result.shoe.shoe_condition || '');
        setBoxCondition(result.shoe.box_condition || '');
        setMyPrice(result.shoe.my_price !== null ? result.shoe.my_price.toString() : '');
        setMessage('Re-identification complete');
        setIdentifying(false);
        setTimeout(() => setMessage(null), 2000);
      });
    };

    startIdentify(
      shoe.id,
      (event, data) => {
        if (event === 'identified' || event === 'done') {
          reloadShoe();
        } else if (event === 'error') {
          setError((data.error as string) || 'Identification failed');
          setIdentifying(false);
        }
      },
      () => { reloadShoe(); },
      (err) => { setError(err); setIdentifying(false); }
    );
  };

  const handleDelete = async () => {
    if (!shoe || !confirm('Delete this shoe from the collection? This cannot be undone.')) return;
    try {
      await deleteShoe(shoe.id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete shoe');
    }
  };

  const handleSelectPrice = (price: number) => {
    setMyPrice(price.toString());
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 aspect-square bg-gray-100 rounded-xl" />
          <div className="lg:col-span-3 space-y-4">
            <div className="h-20 bg-gray-100 rounded-xl" />
            <div className="h-48 bg-gray-100 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !shoe) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-md">
          <p className="text-red-600 font-medium">Error</p>
          <p className="text-red-400 text-sm mt-1">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-500 underline"
          >
            Back to collection
          </button>
        </div>
      </div>
    );
  }

  if (!shoe) return null;

  const isBoxed = shoe.type?.includes('Boxed') && !shoe.type?.includes('Boxless');

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-gray-900 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReidentify}
            disabled={identifying}
            className="text-xs text-gray-400 hover:text-gray-600 disabled:text-gray-300 transition-colors px-2 py-1"
          >
            {identifying ? 'Identifying...' : 'Re-identify'}
          </button>
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {error && shoe && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Main layout: image left, info right */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column: Image */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow-sm border border-gray-100 rounded-2xl overflow-hidden lg:sticky lg:top-6">
            <img
              src={getImageUrl(shoe.image_path)}
              alt={shoe.model || shoe.image_filename}
              className="w-full object-contain max-h-[500px]"
            />
          </div>
        </div>

        {/* Right column: All info */}
        <div className="lg:col-span-3 space-y-5">
          {/* Title + key details */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {shoe.brand || 'Unknown Brand'}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 mt-0.5">
              {shoe.model || shoe.image_filename}
            </h2>
            {shoe.colorway && (
              <p className="text-sm text-gray-500 mt-1">{shoe.colorway}</p>
            )}

            {/* Quick facts row */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {shoe.size && (
                <span className="text-xs font-semibold text-gray-700 bg-gray-100/80 px-3 py-1 rounded-full">
                  Size {shoe.size}
                </span>
              )}
              {shoe.year && (
                <span className="text-xs text-gray-500 bg-gray-100/60 px-3 py-1 rounded-full">
                  {shoe.year}
                </span>
              )}
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                isBoxed
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}>
                {isBoxed ? 'Boxed' : 'No Box'}
              </span>
              {shoe.location && (
                <span className="text-xs text-gray-500 bg-gray-100/60 px-3 py-1 rounded-full">
                  {shoe.location}{shoe.sub_location ? ` · ${shoe.sub_location}` : ''}
                </span>
              )}
            </div>
          </div>

          {/* YOUR PRICE - the hero section */}
          <div className="bg-white shadow-sm border border-gray-100 rounded-xl p-5">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block mb-2">
                  Your Asking Price
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 md:flex-none">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg font-medium">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={myPrice}
                      onChange={(e) => setMyPrice(e.target.value)}
                      placeholder="0.00"
                      className="bg-gray-50 border border-gray-200 text-2xl font-bold text-gray-900 rounded-lg pl-8 pr-4 py-2.5 w-full md:w-48 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder-gray-300 tabular-nums font-mono"
                    />
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium text-sm rounded-lg px-5 py-3 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              {/* Condition selectors */}
              <div className="flex flex-col md:flex-row gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Shoe</label>
                  <select
                    value={shoeCondition}
                    onChange={(e) => setShoeCondition(e.target.value)}
                    className="bg-gray-50 border border-gray-200 text-xs text-gray-900 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="">—</option>
                    <option value="New/DS">New/DS</option>
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Box</label>
                  <select
                    value={boxCondition}
                    onChange={(e) => setBoxCondition(e.target.value)}
                    className="bg-gray-50 border border-gray-200 text-xs text-gray-900 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="">—</option>
                    <option value="Pristine">Pristine</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Missing">Missing</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Research action */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleResearch}
              disabled={researching || !shoe.identified}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-100 disabled:text-gray-300 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {researching ? 'Researching...' : 'Research Prices'}
            </button>
            {sources.length > 0 && (
              <button
                onClick={handleClearPrices}
                className="bg-white hover:bg-red-50 text-gray-400 hover:text-red-600 text-sm rounded-lg px-3 py-2.5 transition-colors border border-gray-200"
                title="Clear all price sources"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          {/* Price Sources */}
          <PriceMatrix sources={sources} shoeType={shoe.type} onSelectPrice={handleSelectPrice} />
        </div>
      </div>
    </div>
  );
}
