import React, { useEffect, useState } from 'react';
import { Sparkles, Wifi, WifiOff, Download, HelpCircle } from 'lucide-react';
import { llmClient } from '../services/llmClient';
import { LLMStatus } from '../types';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface HeaderProps {
  onOpenBuddy: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenBuddy }) => {
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [llmStatus, setLlmStatus] = useState<LLMStatus>({
    state: 'idle',
    statusMessage: '',
    modelName: 'Xenova/flan-t5-small',
    device: 'WebAssembly (On-Device)'
  });

  useEffect(() => {
    const unsubscribe = llmClient.subscribeStatus((st) => setLlmStatus(st));
    return () => unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-extrabold text-white shadow-sm">
          IS2
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
            Invoice Studio 2
          </h1>
          <p className="hidden text-xs text-slate-500 sm:block">Offline-First Invoicing</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* PWA Install Button */}
        {!isInstalled && isInstallable && (
          <button
            type="button"
            onClick={install}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
            aria-label="Install App to Device"
          >
            <Download size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Install App</span>
          </button>
        )}

        {!isInstalled && isIOS && (
          <button
            type="button"
            onClick={() => setShowIOSGuide(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            aria-label="How to install on iOS"
          >
            <HelpCircle size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Install Guide</span>
          </button>
        )}

        {/* Connectivity Status Badge */}
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
            isOnline
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
          title={isOnline ? 'Online: Network active' : 'Offline: Operating from local IndexedDB cache'}
          aria-label={isOnline ? 'Network status: Online' : 'Network status: Offline'}
        >
          {isOnline ? (
            <Wifi size={12} className="text-emerald-600" aria-hidden="true" />
          ) : (
            <WifiOff size={12} className="text-amber-600" aria-hidden="true" />
          )}
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </span>

        {/* Invoice Buddy Trigger */}
        <button
          type="button"
          onClick={onOpenBuddy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 border border-purple-200 px-3 py-1.5 text-xs font-semibold text-purple-700 transition hover:bg-purple-100 active:scale-95"
          aria-label="Open Invoice Buddy AI Assistant"
        >
          <Sparkles size={14} className="text-purple-600" aria-hidden="true" />
          <span>Invoice Buddy</span>
          {llmStatus.state === 'downloading' && (
            <span className="text-[10px] text-purple-800">
              ({llmStatus.progress ?? 0}%)
            </span>
          )}
        </button>
      </div>

      {/* iOS Safari Install Guide Modal */}
      {showIOSGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-guide-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 id="ios-guide-title" className="text-base font-bold text-slate-900">
              Install on iPhone or iPad
            </h3>
            <ol className="mt-3 list-decimal pl-5 text-sm space-y-1.5 text-slate-600">
              <li>Open this page in Safari.</li>
              <li>Tap the <strong>Share</strong> button (box with upward arrow).</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> in the top right corner.</li>
            </ol>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
