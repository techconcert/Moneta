import React, { useEffect, useState } from 'react';
import { X, RefreshCw, CheckCircle2, Building2, KeyRound } from 'lucide-react';
import { PluggyConnect } from 'react-pluggy-connect';
import { safeJsonFetch } from '../lib/api';

interface PluggyConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFetchPluggyItem: (itemId: string) => Promise<boolean>;
}

export const PluggyConnectModal: React.FC<PluggyConnectModalProps> = ({
  isOpen,
  onClose,
  onFetchPluggyItem,
}) => {
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'widget' | 'item_id'>('widget');
  const [itemIdInput, setItemIdInput] = useState('');
  const [isFetchingItem, setIsFetchingItem] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConnectToken();
    } else {
      setConnectToken(null);
      setTokenError(null);
    }
  }, [isOpen]);

  const fetchConnectToken = async () => {
    setIsLoadingToken(true);
    setTokenError(null);
    try {
      const res = await safeJsonFetch<any>('/api/pluggy/connect_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok && res.data && res.data.accessToken) {
        setConnectToken(res.data.accessToken);
      } else if (res.data && res.data.error) {
        setTokenError(typeof res.data.error === 'string' ? res.data.error : JSON.stringify(res.data.error));
      } else if (res.error) {
        setTokenError(res.error);
      } else {
        setTokenError('Could not obtain Pluggy connect token');
      }
    } catch (err: any) {
      setTokenError(err.message || 'Failed to fetch connect token');
    } finally {
      setIsLoadingToken(false);
    }
  };

  const handleManualItemFetch = async () => {
    if (!itemIdInput.trim()) return;
    setIsFetchingItem(true);
    try {
      const success = await onFetchPluggyItem(itemIdInput.trim());
      if (success) {
        onClose();
      }
    } finally {
      setIsFetchingItem(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-purple-600 text-white font-black rounded-xl flex items-center justify-center text-sm shadow-md shadow-purple-600/20">
              PG
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Pluggy Open Finance (Brasil)</h3>
              <div className="flex items-center space-x-1.5 text-[11px] text-emerald-600 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Conexão Oficial com API Pluggy</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="mt-4 flex bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('widget')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'widget' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Pluggy Connect Widget</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('item_id')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'item_id' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Item ID Direct Proxy</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 flex-1 overflow-y-auto">
          {activeTab === 'widget' ? (
            <div className="space-y-4">
              {isLoadingToken && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center">
                  <RefreshCw className="w-7 h-7 text-purple-600 animate-spin" />
                  <p className="text-xs font-semibold text-slate-700">Iniciando Pluggy Connect Widget...</p>
                  <p className="text-[11px] text-slate-400">Autenticando Client ID: c79d9401-b867-402c-994d-85601f0d5c80</p>
                </div>
              )}

              {tokenError && (
                <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-red-700 text-xs space-y-2">
                  <p className="font-bold">Erro ao gerar token Pluggy:</p>
                  <p className="font-mono text-[11px]">{tokenError}</p>
                  <button
                    onClick={fetchConnectToken}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-semibold text-[11px]"
                  >
                    Tentar Novamente
                  </button>
                </div>
              )}

              {connectToken && !isLoadingToken && (
                <div className="flex flex-col items-center w-full min-h-[460px]">
                  <PluggyConnect
                    connectToken={connectToken}
                    includeSandbox={true}
                    onSuccess={async (data) => {
                      const itemId = data.item ? data.item.id : (data as any).itemId;
                      if (itemId) {
                        const ok = await onFetchPluggyItem(itemId);
                        if (ok) onClose();
                      }
                    }}
                    onError={(err) => {
                      console.error('Pluggy Connect Error:', err);
                    }}
                    onClose={onClose}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Se você já conectou uma conta no <strong>Demo App do Pluggy</strong> ou <strong>Console Pluggy</strong>, informe o <code className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-mono font-bold">itemId</code> gerado para buscar as contas bancárias reais, saldos e extratos via API:
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Pluggy Item ID</label>
                <input
                  type="text"
                  placeholder="Ex: 524e931b-7a3a-4a2e-8c5f-..."
                  value={itemIdInput}
                  onChange={(e) => setItemIdInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 font-mono text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 text-purple-800 space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-xs text-purple-900">
                  <CheckCircle2 className="w-4 h-4 text-purple-600" />
                  <span>Conexão Segura Open Finance (BRL)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-purple-700">
                  O servidor AI Studio consulta a API oficial do Pluggy usando sua chave de API e importa todos os saldos e transações em BRL com categorias automáticas.
                </p>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isFetchingItem || !itemIdInput.trim()}
                  onClick={handleManualItemFetch}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 disabled:opacity-50 flex items-center space-x-2"
                >
                  {isFetchingItem ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Buscando Dados do Banco...</span>
                    </>
                  ) : (
                    <span>Puxar Contas e Transações</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
