import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchStats, fetchExportData } from '../lib/api';
import * as XLSX from 'xlsx';
import type { CollectionStats } from '../../../shared/types';

// ── Column group definitions ────────────────────────────────────────────

interface ColumnGroup {
  label: string;
  columns: string[];
  defaultOn: boolean;
}

const COLUMN_GROUPS: ColumnGroup[] = [
  {
    label: 'Basic Info',
    columns: ['brand', 'model', 'colorway', 'size', 'year'],
    defaultOn: true,
  },
  {
    label: 'Organization',
    columns: ['type', 'location', 'sub_location'],
    defaultOn: true,
  },
  {
    label: 'Condition',
    columns: ['shoe_condition', 'box_condition'],
    defaultOn: true,
  },
  {
    label: 'My Price',
    columns: ['my_price'],
    defaultOn: true,
  },
  {
    label: 'Price Matrix',
    columns: [
      'price_new_ds_pristine', 'price_new_ds_damaged', 'price_new_ds_missing',
      'price_excellent_pristine', 'price_excellent_damaged', 'price_excellent_missing',
      'price_good_pristine', 'price_good_damaged', 'price_good_missing',
      'price_fair_pristine', 'price_fair_damaged', 'price_fair_missing',
    ],
    defaultOn: false,
  },
  {
    label: 'Price Sources',
    columns: [
      'source_new_ds_pristine', 'source_new_ds_damaged', 'source_new_ds_missing',
      'source_excellent_pristine', 'source_excellent_damaged', 'source_excellent_missing',
      'source_good_pristine', 'source_good_damaged', 'source_good_missing',
      'source_fair_pristine', 'source_fair_damaged', 'source_fair_missing',
    ],
    defaultOn: false,
  },
  {
    label: 'Metadata',
    columns: ['id', 'image_path', 'image_filename', 'identified', 'created_at', 'updated_at'],
    defaultOn: false,
  },
];

const ALL_COLUMNS = COLUMN_GROUPS.flatMap(g => g.columns);
const PRICE_COLUMNS = new Set(COLUMN_GROUPS.find(g => g.label === 'Price Matrix')!.columns.concat(['my_price']));

function defaultSelected(): Set<string> {
  const s = new Set<string>();
  for (const g of COLUMN_GROUPS) {
    if (g.defaultOn) g.columns.forEach(c => s.add(c));
  }
  return s;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function prettyColumnName(col: string): string {
  return col.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/Ds/g, 'DS');
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

// ── Component ───────────────────────────────────────────────────────────

export default function Export() {
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [exportData, setExportData] = useState<Record<string, string | number | null>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(defaultSelected);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  // Fetch stats + export data on mount
  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));

    fetchExportData()
      .then(setExportData)
      .catch(() => {})
      .finally(() => setDataLoading(false));
  }, []);

  // Derived: which columns exist in the actual data
  const availableColumns = useMemo(() => {
    if (!exportData || exportData.length === 0) return new Set(ALL_COLUMNS);
    return new Set(Object.keys(exportData[0]));
  }, [exportData]);

  // ── Toggle helpers ──────────────────────────────────────────────────

  const toggleColumn = useCallback((col: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((group: ColumnGroup) => {
    setSelected(prev => {
      const next = new Set(prev);
      const allOn = group.columns.every(c => next.has(c));
      for (const c of group.columns) {
        if (allOn) next.delete(c);
        else next.add(c);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(ALL_COLUMNS)), []);
  const deselectAll = useCallback(() => setSelected(new Set()), []);

  // ── Export logic ────────────────────────────────────────────────────

  const selectedColumns = useMemo(
    () => ALL_COLUMNS.filter(c => selected.has(c) && availableColumns.has(c)),
    [selected, availableColumns],
  );

  const filteredData = useMemo(() => {
    if (!exportData) return [];
    return exportData.map(row => {
      const filtered: Record<string, unknown> = {};
      for (const col of selectedColumns) {
        filtered[col] = row[col];
      }
      return filtered;
    });
  }, [exportData, selectedColumns]);

  const handleExportCSV = useCallback(() => {
    if (filteredData.length === 0) return;
    setExporting('csv');
    try {
      const headers = selectedColumns;
      const rows = [headers.map(h => escapeCSV(h)).join(',')];
      for (const row of filteredData) {
        rows.push(headers.map(h => escapeCSV(row[h])).join(','));
      }
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      triggerDownload(blob, `solelibrary_export_${dateStamp()}.csv`);
    } finally {
      setExporting(null);
    }
  }, [filteredData, selectedColumns]);

  const handleExportXLSX = useCallback(() => {
    if (filteredData.length === 0) return;
    setExporting('xlsx');
    try {
      const ws = XLSX.utils.json_to_sheet(filteredData, { header: selectedColumns });

      // Auto-width columns
      const colWidths = selectedColumns.map(col => {
        const headerLen = prettyColumnName(col).length;
        let maxLen = headerLen;
        for (const row of filteredData) {
          const val = row[col];
          const len = val != null ? String(val).length : 0;
          if (len > maxLen) maxLen = len;
        }
        return { wch: Math.min(maxLen + 2, 50) };
      });
      ws['!cols'] = colWidths;

      // Format price columns as currency
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let C = range.s.c; C <= range.e.c; C++) {
        const colName = selectedColumns[C];
        if (PRICE_COLUMNS.has(colName)) {
          for (let R = range.s.r + 1; R <= range.e.r; R++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = ws[addr];
            if (cell && typeof cell.v === 'number') {
              cell.z = '$#,##0.00';
            }
          }
        }
      }

      // Bold header row
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c: C });
        const cell = ws[addr];
        if (cell) {
          cell.s = { font: { bold: true } };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Collection');
      XLSX.writeFile(wb, `solelibrary_export_${dateStamp()}.xlsx`);
    } finally {
      setExporting(null);
    }
  }, [filteredData, selectedColumns]);

  // ── Render ──────────────────────────────────────────────────────────

  const selectedCount = selectedColumns.length;
  const totalCount = ALL_COLUMNS.filter(c => availableColumns.has(c)).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Export</h2>
        <p className="text-sm text-gray-500 mt-1">Choose columns and download your collection data</p>
      </div>

      {/* Export summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Summary</h3>
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-100 rounded w-48" />
            <div className="h-4 bg-gray-100 rounded w-32" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400">Total Shoes</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_shoes}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Identified</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.identified_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Priced</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.priced_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total Value</p>
              <p className="text-2xl font-bold text-emerald-600 font-mono">{formatPrice(stats.total_value)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Brands</p>
              <p className="text-2xl font-bold text-gray-900">
                {Object.keys(stats.by_brand).length}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Locations</p>
              <p className="text-2xl font-bold text-gray-900">
                {Object.keys(stats.by_location).length}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Could not load stats</p>
        )}
      </div>

      {/* Column picker */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Select Columns</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {selectedCount} of {totalCount} columns selected
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>

        {dataLoading ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-50 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {COLUMN_GROUPS.map(group => {
              const groupCols = group.columns.filter(c => availableColumns.has(c));
              if (groupCols.length === 0) return null;
              const allOn = groupCols.every(c => selected.has(c));
              const someOn = groupCols.some(c => selected.has(c));

              return (
                <div key={group.label} className="border border-gray-100 rounded-lg p-4">
                  {/* Group header checkbox */}
                  <label className="flex items-center gap-3 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={el => { if (el) el.indeterminate = someOn && !allOn; }}
                      onChange={() => toggleGroup(group)}
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-medium text-gray-900 text-sm">{group.label}</span>
                    <span className="text-xs text-gray-400">
                      {groupCols.filter(c => selected.has(c)).length}/{groupCols.length}
                    </span>
                  </label>

                  {/* Individual column checkboxes */}
                  <div className="ml-7 flex flex-wrap gap-x-4 gap-y-1.5">
                    {groupCols.map(col => (
                      <label key={col} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(col)}
                          onChange={() => toggleColumn(col)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-xs text-gray-600 font-mono">{col}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Export buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={handleExportCSV}
          disabled={selectedCount === 0 || dataLoading || exporting !== null}
          className="flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl px-6 py-4 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
        </button>

        <button
          onClick={handleExportXLSX}
          disabled={selectedCount === 0 || dataLoading || exporting !== null}
          className="flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl px-6 py-4 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {exporting === 'xlsx' ? 'Exporting...' : 'Export XLSX'}
        </button>
      </div>

      {/* About the Export */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">About the Export</h3>
        <ul className="space-y-2 text-sm text-gray-500">
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5">--</span>
            All shoe records are included (identified and unidentified)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5">--</span>
            Use column groups to quickly toggle related fields
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5">--</span>
            Price Matrix includes marketplace prices for all condition combos
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5">--</span>
            XLSX exports include currency formatting and bold headers
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 mt-0.5">--</span>
            CSV is best for importing into other tools; XLSX for Excel/Numbers
          </li>
        </ul>
      </div>
    </div>
  );
}
