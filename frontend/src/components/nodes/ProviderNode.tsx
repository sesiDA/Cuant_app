import { useState, useEffect , useRef} from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';

// ... (interfaces y timeframeToMs iguales) ...
interface MarketConfig { id: string; symbol: string; timeframe: string; paused: boolean; progress: number; error: string | null; lastUpdate: number; }
const timeframeToMs = (tf: string) => { const map: Record<string, number> = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000 }; return map[tf] || 60000; };

export default function ProviderNode({ id, data }: { id: string, data: any }) {
  const { setNodes, updateNodeData } = useReactFlow();
  const [provider, setProvider] = useState('MT5');
  const [markets, setMarkets] = useState<MarketConfig[]>([]);
  const [nodeError] = useState<string | null>(null);
  
  // NUEVO: Estado global de pausa
  const [globalPaused, setGlobalPaused] = useState(false);
  
  const [isAdding, setIsAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newTimeframe, setNewTimeframe] = useState('1m');

  const marketsCleanupRef = useRef(markets);
  useEffect(() => { marketsCleanupRef.current = markets; }, [markets]);

  // EVENTO DE DESMONTAJE
  useEffect(() => {
    return () => {
      marketsCleanupRef.current.forEach(m => {
        data.wsSend?.({ action: 'unsubscribe', marketId: m.id });
      });
    };
  }, []); 
  useEffect(() => {
    updateNodeData(id, { markets });
  }, [markets, id, updateNodeData]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setMarkets(prev => prev.map(market => {
        if (market.paused || market.error) return market;
        const tfMs = timeframeToMs(market.timeframe);
        let elapsed = now - market.lastUpdate;
        if (elapsed >= tfMs) return { ...market, lastUpdate: now, progress: 0 };
        return { ...market, progress: (elapsed / tfMs) * 100 };
      }));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (data.marketUpdate) {
      setMarkets(prev => prev.map(m => m.id === data.marketUpdate.id ? { ...m, lastUpdate: data.marketUpdate.timestamp, progress: 0 } : m));
    }
  }, [data.marketUpdate]);

  useEffect(() => {
    if (data.marketError) setMarkets(prev => prev.map(m => m.id === data.marketError.id ? { ...m, error: data.marketError.message } : m));
  }, [data.marketError]);

  // NUEVO: Lógica de Pausa Maestra
  const toggleGlobalPause = () => {
    const willPause = !globalPaused;
    setGlobalPaused(willPause);
    
    setMarkets(prev => prev.map(m => {
      if (m.paused !== willPause) {
        if (willPause) data.wsSend?.({ action: 'unsubscribe', marketId: m.id });
        else data.wsSend?.({ action: 'subscribe', marketId: m.id, symbol: m.symbol, timeframe: m.timeframe });
      }
      return { ...m, paused: willPause };
    }));
  };

  // NUEVO: Lógica de Pausa Individual sincronizada
  const togglePause = (mId: string) => {
    setMarkets(prev => {
      const newMarkets = prev.map(m => {
        if (m.id === mId) {
          const isPausing = !m.paused;
          if (isPausing) data.wsSend?.({ action: 'unsubscribe', marketId: mId });
          else data.wsSend?.({ action: 'subscribe', marketId: mId, symbol: m.symbol, timeframe: m.timeframe });
          return { ...m, paused: isPausing };
        }
        return m;
      });
      
      // Sincronización del estado global
      const justResumed = newMarkets.find(m => m.id === mId)?.paused === false;
      if (justResumed) setGlobalPaused(false);
      else if (newMarkets.length > 0 && newMarkets.every(m => m.paused)) setGlobalPaused(true);
      
      return newMarkets;
    });
  };

  const removeMarket = (mId: string) => {
    data.wsSend?.({ action: 'unsubscribe', marketId: mId });
    setMarkets(prev => {
      const newMarkets = prev.filter(m => m.id !== mId);
      if (newMarkets.length > 0 && newMarkets.every(m => m.paused)) setGlobalPaused(true);
      return newMarkets;
    });
  };

  const confirmAddMarket = () => {
    if (!newSymbol.trim()) return;
    const newId = Date.now().toString();
    const symbolClean = newSymbol.toUpperCase();
    
    setMarkets([...markets, { id: newId, symbol: symbolClean, timeframe: newTimeframe, paused: false, progress: 0, error: null, lastUpdate: Date.now() }]);
    data.wsSend?.({ action: 'subscribe', marketId: newId, symbol: symbolClean, timeframe: newTimeframe });
    
    setGlobalPaused(false); // Al añadir uno nuevo, se activa
    setIsAdding(false);
    setNewSymbol('');
  };

  return (
    <div style={{ backgroundColor: '#ffffff', border: `1px solid ${nodeError ? '#ef4444' : '#e5e7eb'}`, borderRadius: '12px', width: '320px', fontFamily: 'Inter, system-ui, sans-serif', boxShadow: '0 10px 15px -3px rgba(56, 189, 248, 0.1)', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>
            Data Provider
          </div>
          
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* Botón Global */}
            <button onClick={toggleGlobalPause} title={globalPaused ? "Reanudar todo" : "Pausar todo"} style={{ background: globalPaused ? '#fef2f2' : '#f0f9ff', border: `1px solid ${globalPaused ? '#fecaca' : '#bae6fd'}`, borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px', color: globalPaused ? '#ef4444' : '#0369a1' }}>
              {globalPaused ? '▶' : '⏸'}
            </button>
            <button onClick={() => setNodes((nodes) => nodes.filter((n) => n.id !== id))} title="Eliminar herramienta" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px', color: '#ef4444' }}>
              ✕
            </button>
          </div>
        </div>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '6px', outline: 'none' }}>
          <option value="MT5">MetaTrader 5</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {markets.map((market) => (
          <div key={market.id} style={{ position: 'relative', padding: '12px 16px', borderBottom: '1px solid #f3f4f6', backgroundColor: market.error ? '#fef2f2' : 'transparent' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontWeight: '500', fontSize: '14px', color: market.error ? '#b91c1c' : (market.paused ? '#9ca3af' : '#111827') }}>
                {market.symbol} <span style={{ color: '#9ca3af', fontSize: '12px' }}>{market.timeframe}</span>
                {market.error && <span title={market.error} style={{ cursor: 'help' }}>🔴</span>}
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => togglePause(market.id)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px', color: market.paused ? '#ef4444' : '#6b7280' }}>
                  {market.paused ? '▶' : '⏸'}
                </button>
                <button onClick={() => removeMarket(market.id)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px', color: '#ef4444' }}>✕</button>
              </div>
            </div>
            <div style={{ width: '100%', height: '4px', backgroundColor: market.error ? '#fecaca' : '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${market.progress}%`, height: '100%', backgroundColor: market.error ? '#ef4444' : (market.paused ? '#cbd5e1' : '#38bdf8'), transition: market.progress < 2 ? 'none' : 'width 50ms linear' }} />
            </div>
            <Handle type="source" position={Position.Right} id={`handle-${market.id}`} style={{ background: market.error ? '#ef4444' : (market.paused ? '#cbd5e1' : '#38bdf8'), width: '10px', height: '10px', border: '2px solid #fff', right: '-5px' }} />
          </div>
        ))}
      </div>
      
      <div style={{ padding: '12px 16px', backgroundColor: '#fafafa', borderRadius: '0 0 12px 12px' }}>
        {isAdding ? (
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input autoFocus placeholder="Ej. EURUSD" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} style={{ flex: 1, padding: '6px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '4px', textTransform: 'uppercase' }} />
              <select value={newTimeframe} onChange={(e) => setNewTimeframe(e.target.value)} style={{ padding: '6px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                <option value="1m">1m</option><option value="5m">5m</option><option value="15m">15m</option><option value="1h">1h</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={confirmAddMarket} style={{ flex: 1, padding: '6px', backgroundColor: '#38bdf8', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Añadir</button>
              <button onClick={() => setIsAdding(false)} style={{ flex: 1, padding: '6px', backgroundColor: '#e5e7eb', color: '#4b5563', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setIsAdding(true)} style={{ width: '100%', padding: '8px', background: 'none', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
            + Añadir Mercado
          </button>
        )}
      </div>
    </div>
  );
}