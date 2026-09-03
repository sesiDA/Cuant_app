import { useState, useEffect } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';

interface HistMarket { id: string; symbol: string; timeframe: string; amount: string | number; unit: string; progress: number; error: string | null; loading: boolean; }

export default function HistoricalNode({ id, data }: { id: string, data: any }) {
  const { setNodes, updateNodeData } = useReactFlow();
  const [provider, setProvider] = useState('MT5');
  const [markets, setMarkets] = useState<HistMarket[]>([]);
  
  const [isAdding, setIsAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newTimeframe, setNewTimeframe] = useState('1m');

  // Sincronizar estado para el enrutador
  useEffect(() => { updateNodeData(id, { markets }); }, [markets, id, updateNodeData]);

  // Escuchar eventos de progreso
  useEffect(() => {
    if (data.histProgress) {
      setMarkets(prev => prev.map(m => m.id === data.histProgress.id ? { ...m, progress: data.histProgress.pct } : m));
    }
  }, [data.histProgress]);

  // Escuchar eventos de completado y errores
  useEffect(() => {
    if (data.marketError) setMarkets(prev => prev.map(m => m.id === data.marketError.id ? { ...m, error: data.marketError.message, loading: false } : m));
    if (data.histComplete) setMarkets(prev => prev.map(m => m.id === data.histComplete.id ? { ...m, progress: 100, loading: false } : m));
  }, [data.marketError, data.histComplete]);

  const updateAmount = (mId: string, val: string) => setMarkets(prev => prev.map(m => m.id === mId ? { ...m, amount: val } : m));
  
  const loadData = (mId: string) => {
    const m = markets.find(x => x.id === mId);
    if (!m) return;
    
    setMarkets(prev => prev.map(x => x.id === mId ? { ...x, progress: 0, loading: true, error: null } : x));
    
    data.wsSend?.({
      action: 'historical_load', marketId: m.id, symbol: m.symbol,
      timeframe: m.timeframe, amount: Number(m.amount) || 1, // Convertimos al hacer click
      unit: m.unit
    });
  };

  const removeMarket = (mId: string) => setMarkets(prev => prev.filter(m => m.id !== mId));
  const updateUnit = (mId: string, unt: string) => setMarkets(prev => prev.map(m => m.id === mId ? { ...m, unit: unt } : m));

  const confirmAddMarket = () => {
    if (!newSymbol.trim()) return;
    const newId = Date.now().toString();
    const symbolClean = newSymbol.toUpperCase();
    
    setMarkets([...markets, { 
      id: newId, symbol: symbolClean, timeframe: newTimeframe, 
      amount: 1, unit: 'd', progress: 0, error: null, loading: false 
    }]);

    // NUEVO: Petición de verificación al backend
    data.wsSend?.({ action: 'verify_symbol', marketId: newId, symbol: symbolClean });
    
    setIsAdding(false); 
    setNewSymbol('');
  };

  return (
    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', width: '380px', fontFamily: 'Inter, system-ui, sans-serif', boxShadow: '0 10px 15px -3px rgba(139, 92, 246, 0.1)', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>Inyector Histórico</div>
          <button onClick={() => setNodes(nodes => nodes.filter(n => n.id !== id))} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px', color: '#ef4444' }}>✕</button>
        </div>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '6px', outline: 'none' }}>
          <option value="MT5">MetaTrader 5</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {markets.map((m) => (
          <div key={m.id} style={{ position: 'relative', padding: '12px 16px', borderBottom: '1px solid #f3f4f6', backgroundColor: m.error ? '#fef2f2' : 'transparent' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontWeight: '500', fontSize: '14px', color: m.error ? '#b91c1c' : '#111827' }}>
                {m.symbol} <span style={{ color: '#9ca3af', fontSize: '12px' }}>{m.timeframe}</span>
                {m.error && <span title={m.error} style={{ cursor: 'help' }}>🔴</span>}
              </div>
              <button onClick={() => removeMarket(m.id)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px', color: '#ef4444' }}>✕</button>
            </div>

            {/* Selector de Rango y Botón de Carga */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <input type="number" value={m.amount} onChange={e => updateAmount(m.id, e.target.value)} min="1" style={{ width: '50px', padding: '4px', fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: '4px' }} disabled={m.loading} />
              <select value={m.unit} onChange={e => updateUnit(m.id, e.target.value)} style={{ flex: 1, padding: '4px', fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: '4px' }} disabled={m.loading}>
                <option value="m">Minutos</option><option value="h">Horas</option><option value="d">Días</option>
                <option value="w">Semanas</option><option value="mo">Meses</option><option value="y">Años</option>
              </select>
              <button onClick={() => loadData(m.id)} disabled={m.loading} style={{ background: m.loading ? '#e5e7eb' : '#8b5cf6', color: m.loading ? '#9ca3af' : '#fff', border: 'none', borderRadius: '4px', cursor: m.loading ? 'not-allowed' : 'pointer', padding: '4px 12px', fontSize: '12px', fontWeight: '500' }}>
                {m.loading ? 'Cargando...' : 'Load'}
              </button>
            </div>

            {/* Barra de Progreso Backend */}
            <div style={{ width: '100%', height: '4px', backgroundColor: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${m.progress}%`, height: '100%', backgroundColor: m.error ? '#ef4444' : '#8b5cf6', transition: 'width 0.2s ease-out' }} />
            </div>

            <Handle type="source" position={Position.Right} id={`handle-${m.id}`} style={{ background: '#8b5cf6', width: '10px', height: '10px', border: '2px solid #fff', right: '-5px' }} />
          </div>
        ))}
      </div>
      
      <div style={{ padding: '12px 16px', backgroundColor: '#fafafa', borderRadius: '0 0 12px 12px' }}>
        {isAdding ? (
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input autoFocus placeholder="Ej. EURUSD" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} style={{ flex: 1, padding: '6px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '4px', textTransform: 'uppercase' }} />
              <select value={newTimeframe} onChange={(e) => setNewTimeframe(e.target.value)} style={{ padding: '6px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
                <option value="1m">1m</option><option value="5m">5m</option><option value="1h">1h</option><option value="1d">1d</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={confirmAddMarket} style={{ flex: 1, padding: '6px', backgroundColor: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Añadir</button>
              <button onClick={() => setIsAdding(false)} style={{ flex: 1, padding: '6px', backgroundColor: '#e5e7eb', color: '#4b5563', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setIsAdding(true)} style={{ width: '100%', padding: '8px', background: 'none', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>+ Preparar Inyección</button>
        )}
      </div>
    </div>
  );
}