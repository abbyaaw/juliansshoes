import { useState, useEffect, useRef } from 'react';
import { fetchStats, startScan, bulkResearch } from '../lib/api';
import type { CollectionStats } from '../../../shared/types';

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function Settings() {
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [progress, setProgress] = useState({ total: 0, completed: 0, current: '' });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, message, type }]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  useEffect(() => {
    async function load() {
      try {
        const s = await fetchStats();
        setStats(s);
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleRescan = async () => {
    try {
      setRescanning(true);
      addLog('Starting folder re-scan...');
      const result = await startScan();
      addLog(`${result.message}`, 'success');
      // Refresh stats
      const s = await fetchStats();
      setStats(s);
    } catch (err) {
      addLog(err instanceof Error ? err.message : 'Re-scan failed', 'error');
    } finally {
      setRescanning(false);
    }
  };

  const handleBulkResearch = () => {
    setBulkRunning(true);
    setProgress({ total: 0, completed: 0, current: '' });
    addLog('Starting bulk price research...');

    bulkResearch(
      (event, data) => {
        if (event === 'start') {
          setProgress((prev) => ({ ...prev, total: (data.total as number) || prev.total }));
          addLog(`Found ${data.total} shoes to research`);
        } else if (event === 'progress') {
          setProgress({
            total: (data.total as number) || 0,
            completed: (data.completed as number) || 0,
            current: (data.current as string) || '',
          });
          addLog(`Researching: ${data.current}`);
        } else if (event === 'researched') {
          addLog(`  Found ${data.sources_count || 0} price sources`, 'success');
          setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
        } else if (event === 'error') {
          addLog((data.error as string) || `Failed: ${data.current}`, 'error');
        } else if (event === 'done') {
          setBulkRunning(false);
          addLog(`Bulk research complete: ${data.completed}/${data.total}`, 'success');
          fetchStats().then(setStats).catch(() => {});
        }
      },
      () => {
        setBulkRunning(false);
        fetchStats().then(setStats).catch(() => {});
      },
      (err) => {
        addLog(`Error: ${err}`, 'error');
        setBulkRunning(false);
        fetchStats().then(setStats).catch(() => {});
      }
    );
  };

  const progressPercent =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Manage your collection and run bulk operations</p>
      </div>

      {/* Status overview */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Collection Status</h3>
        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-100 rounded w-48" />
            <div className="h-4 bg-gray-100 rounded w-32" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400">Total Shoes</p>
              <p className="text-xl font-bold text-gray-900">{stats.total_shoes}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Need Identification</p>
              <p className={`text-xl font-bold ${stats.unidentified_count > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {stats.unidentified_count}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Need Pricing</p>
              <p className={`text-xl font-bold ${stats.unpriced_count > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {stats.unpriced_count}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Collection Value</p>
              <p className="text-xl font-bold text-emerald-600 font-mono">
                ${stats.total_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Failed to load stats</p>
        )}
      </div>

      {/* API Status */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">API Configuration</h3>
        <p className="text-sm text-gray-500">
          The Gemini API key is configured in the server's <code className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-xs">.env</code> file. Vision identification and price research use the server-side key.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full" />
          <span className="text-sm text-emerald-600">Server-side configuration</span>
        </div>
      </div>

      {/* Bulk Operations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Re-scan */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Re-scan Folders</h3>
          <p className="text-sm text-gray-500 mb-4">
            Scan shoe photo folders again to discover any new images that have been added.
          </p>
          <button
            onClick={handleRescan}
            disabled={rescanning || bulkRunning}
            className="bg-white hover:bg-gray-50 disabled:bg-gray-50 disabled:text-gray-300 text-gray-900 font-medium text-sm rounded-lg px-6 py-2.5 transition-colors border border-gray-200 w-full"
          >
            {rescanning ? 'Scanning...' : 'Re-scan Folders'}
          </button>
        </div>

        {/* Bulk research */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Bulk Price Research</h3>
          <p className="text-sm text-gray-500 mb-4">
            Research prices for all identified shoes that don't have pricing yet.
            {stats && stats.unpriced_count > 0 && (
              <span className="text-amber-600"> ({stats.unpriced_count} shoes need pricing)</span>
            )}
          </p>
          <button
            onClick={handleBulkResearch}
            disabled={rescanning || bulkRunning}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium text-sm rounded-lg px-6 py-2.5 transition-colors w-full"
          >
            {bulkRunning ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Researching...
              </span>
            ) : (
              'Bulk Research Prices'
            )}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {bulkRunning && progress.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Research Progress</span>
            <span className="text-sm font-medium text-gray-900">
              {progress.completed} / {progress.total} ({progressPercent}%)
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {progress.current && (
            <p className="text-xs text-gray-400 mt-2 truncate">
              Current: {progress.current}
            </p>
          )}
        </div>
      )}

      {/* Activity Log */}
      {logs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-500">Activity Log</h4>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>
          <div className="p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
            {logs.map((log, i) => (
              <div
                key={i}
                className={`${
                  log.type === 'error'
                    ? 'text-red-500'
                    : log.type === 'success'
                    ? 'text-emerald-600'
                    : 'text-gray-500'
                }`}
              >
                <span className="text-gray-300">[{log.time}]</span> {log.message}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
