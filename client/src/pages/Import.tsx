import { useState, useRef } from 'react';
import { startScan, startIdentify } from '../lib/api';

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function Import() {
  const [scanning, setScanning] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [scanResult, setScanResult] = useState<{
    message: string;
    new_shoes: number;
    folders: string[];
  } | null>(null);
  const [progress, setProgress] = useState({ total: 0, completed: 0, current: '' });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { time, message, type }]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleScan = async () => {
    try {
      setScanning(true);
      setLogs([]);
      setErrors([]);
      setScanResult(null);
      addLog('Scanning folders for new shoe images...');

      const result = await startScan();
      setScanResult(result);
      addLog(`Scan complete: ${result.message}`, 'success');

      if (result.folders.length > 0) {
        result.folders.forEach((f) => addLog(`  Found in: ${f}`, 'info'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed';
      addLog(msg, 'error');
      setErrors((prev) => [...prev, msg]);
    } finally {
      setScanning(false);
    }
  };

  const handleIdentify = () => {
    setIdentifying(true);
    setProgress({ total: 0, completed: 0, current: '' });
    setErrors([]);
    addLog('Starting identification...');

    startIdentify(
      undefined,
      (event, data) => {
        if (event === 'start') {
          setProgress((prev) => ({ ...prev, total: (data.total as number) || prev.total }));
          addLog(`Found ${data.total} shoes to identify`);
        } else if (event === 'progress') {
          setProgress({
            total: (data.total as number) || 0,
            completed: (data.completed as number) || 0,
            current: (data.current_file as string) || '',
          });
          addLog(`Identifying: ${data.current_file}`);
        } else if (event === 'identified') {
          const r = data.result as Record<string, unknown>;
          addLog(`  Identified: ${r?.brand} ${r?.model || ''} - ${r?.colorway || ''}`, 'success');
          setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
        } else if (event === 'error') {
          const errMsg = (data.error as string) || `Failed: ${data.filename}`;
          addLog(errMsg, 'error');
          setErrors((prev) => [...prev, errMsg]);
        } else if (event === 'done') {
          addLog(`Identification complete: ${data.completed}/${data.total} processed`, 'success');
          setIdentifying(false);
        }
      },
      () => {
        setIdentifying(false);
      },
      (err) => {
        addLog(`Error: ${err}`, 'error');
        setIdentifying(false);
      }
    );
  };

  const progressPercent =
    progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Import</h2>
        <p className="text-sm text-gray-500 mt-1">Scan folders and identify shoe images</p>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Scan */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Step 1: Scan Folders</h3>
          <p className="text-sm text-gray-500 mb-4">
            Discover new shoe images from the photo folders. This will add unprocessed images to the
            database without identifying them.
          </p>
          <button
            onClick={handleScan}
            disabled={scanning || identifying}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium text-sm rounded-lg px-6 py-2.5 transition-colors w-full"
          >
            {scanning ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scanning...
              </span>
            ) : (
              'Scan Folders'
            )}
          </button>

          {scanResult && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-emerald-600 font-medium">{scanResult.message}</p>
              <p className="text-sm text-gray-500 mt-1">
                {scanResult.new_shoes} new shoes found
              </p>
              {scanResult.folders.length > 0 && (
                <div className="mt-2 space-y-1">
                  {scanResult.folders.map((f) => (
                    <p key={f} className="text-xs text-gray-400">
                      {f}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Identify */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Step 2: Identify All</h3>
          <p className="text-sm text-gray-500 mb-4">
            Use AI vision to identify unidentified shoes. This will analyze each image and detect
            the brand, model, colorway, size, and condition.
          </p>
          <button
            onClick={handleIdentify}
            disabled={scanning || identifying}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-200 disabled:text-gray-400 text-white font-medium text-sm rounded-lg px-6 py-2.5 transition-colors w-full"
          >
            {identifying ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Identifying...
              </span>
            ) : (
              'Identify All Unidentified'
            )}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {identifying && progress.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Progress</span>
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

      {/* Error summary */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h4 className="text-sm font-semibold text-red-600 mb-2">
            Errors ({errors.length})
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {errors.map((err, i) => (
              <p key={i} className="text-xs text-red-400">
                {err}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Logs */}
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
