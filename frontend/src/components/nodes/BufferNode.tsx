import { useState, useEffect, useRef} from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';

interface TableConfig { id: string; name: string; paused: boolean; count: number; }
export default function BufferNode({ id, data }: { id: string, data: any }) {
  const { setNodes, setEdges } = useReactFlow(); 
  const [database, setDatabase] = useState('LOCAL_MEM');
  const [tables, setTables] = useState<TableConfig[]>([]);
  const [globalPaused, setGlobalPaused] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const lastProcessedRef = useRef<string | null>(null);
  // Usamos referencias para acceder a los datos sin provocar renderizados
  const tablesRef = useRef(tables);
  useEffect(() => { tablesRef.current = tables; }, [tables]);
  
  // 1. REINICIO AL CAMBIAR DE MEMORIA
  useEffect(() => {
    // 1. Cortar todos los cables (edges) conectados a las tablas de este nodo
    setEdges(eds => eds.filter(e => {
      // Identificamos si el cable entra o sale de UNA TABLA de ESTE nodo
      const isTargetingTable = e.target === id && e.targetHandle?.startsWith('in-');
      const isSourcingFromTable = e.source === id && e.sourceHandle?.startsWith('out-');
      
      // Si el cable va a una tabla, lo eliminamos. Conservamos cables de 'auto-add' o 'console'
      return !(isTargetingTable || isSourcingFromTable);
    }));

    // 2. Vaciamos las tablas visuales
    setTables([]); 
  }, [database, id, setEdges]);

  // 2. RECEPCIÓN DE DATOS (SINGLE O BATCH) Y PROPAGACIÓN
  useEffect(() => {
    if (globalPaused || !data?.incomingData) return;
    const payload = data.incomingData;

    if (!payload.msgId || lastProcessedRef.current === payload.msgId) return;
    lastProcessedRef.current = payload.msgId;

    if (payload.targetHandle) {
      const targetTableId = payload.targetHandle.replace('in-', '');
      const table = tablesRef.current.find(t => t.id === targetTableId);
      
      if (table && !table.paused) {
        if (payload.dataType === 'single') {
          setTables(prev => prev.map(t => t.id === targetTableId ? { ...t, count: t.count + 1 } : t));
          data.wsSend?.({ action: 'buffer_append', tableId: targetTableId, mode: database, data: payload.data });
        } 
        else if (payload.dataType === 'accumulated') {
          setTables(prev => prev.map(t => t.id === targetTableId ? { ...t, count: t.count + payload.data.length } : t));
          data.wsSend?.({ action: 'buffer_append_batch', tableId: targetTableId, mode: database, data: payload.data });
        }

        // --- NUEVO: PROPAGACIÓN HACIA ADELANTE (FORWARDING) ---
        // Despachamos un evento para que App.tsx mueva el dato al siguiente cable
        window.dispatchEvent(new CustomEvent('forwardData', { 
          detail: { 
            sourceHandle: `out-${targetTableId}`, 
            payload: payload // Pasamos el payload íntegro para que siga viajando
          } 
        }));
      }
    }
  }, [data?.incomingData, globalPaused, database]);
  // 3. AUTO-DESCUBRIMIENTO EN CALIENTE (Solicitado por App.tsx al soltar el cable)
  useEffect(() => {
    if (data.autoAddRequest) {
      const req = data.autoAddRequest;
      setTables(prev => {
        if (!prev.find(t => t.id === req.id)) {
          // Pide al backend cargar datos existentes para esta tabla
          data.wsSend?.({ action: 'buffer_load', tableId: req.id, mode: database });
          return [...prev, { id: req.id, name: req.name, paused: false, count: 0 }];
        }
        return prev;
      });
    }
  }, [data.autoAddRequest, database]);

  // 4. ACTUALIZACIÓN DEL CONTADOR AL CARGAR MEMORIA PERSISTENTE
  useEffect(() => {
    if (data.loadedTable) {
      setTables(prev => prev.map(t => t.id === data.loadedTable.id ? { ...t, count: data.loadedTable.count } : t));
    }
  }, [data.loadedTable]);
  //5. ESCUCHA DE MUTACIONES EXTERNAS (Desde la Consola)
  useEffect(() => {
    if (data.refreshTrigger) {
      // Si la consola alteró datos, recargamos todas las tablas activas
      tables.forEach(t => data.wsSend?.({ action: 'buffer_load', tableId: t.id, mode: database }));
    }
  }, [data.refreshTrigger]);
  const toggleGlobalPause = () => setGlobalPaused(!globalPaused);
  const togglePause = (tId: string) => setTables(prev => prev.map(t => t.id === tId ? { ...t, paused: !t.paused } : t));
  
  const removeTable = (tId: string) => {
    data.wsSend?.({ action: 'buffer_clear', tableId: tId, mode: database });
    setTables(prev => prev.filter(t => t.id !== tId));
  };

  const confirmAddTable = () => {
    if (!newTableName.trim()) return;
    const name = newTableName.trim(); // Case sensitive
    const newId = name.replace(/[^a-zA-Z0-9_]/g, '_'); // ID seguro
    
    setTables(prev => [...prev, { id: newId, name: name, paused: false, count: 0 }]);
    data.wsSend?.({ action: 'buffer_load', tableId: newId, mode: database });
    
    setIsAdding(false);
    setNewTableName('');
  };

  const deleteNode = () => {
    tables.forEach(t => data.wsSend?.({ action: 'buffer_clear', tableId: t.id, mode: database }));
    setNodes(nodes => nodes.filter(n => n.id !== id));
  };

  return (
    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', width: '320px', fontFamily: 'Inter, system-ui, sans-serif', boxShadow: '0 10px 15px -3px rgba(56, 189, 248, 0.1)', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ padding: '16px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>Buffer</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={toggleGlobalPause} title="Pausa Global" style={{ background: globalPaused ? '#fef2f2' : '#f0f9ff', border: `1px solid ${globalPaused ? '#fecaca' : '#bae6fd'}`, borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px', color: globalPaused ? '#ef4444' : '#0369a1' }}>{globalPaused ? '▶' : '⏸'}</button>
            <button onClick={deleteNode} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px', color: '#ef4444' }}>✕</button>
          </div>
        </div>
        <select value={database} onChange={(e) => setDatabase(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '14px', border: '1px solid #e5e7eb', borderRadius: '6px', outline: 'none' }}>
          <option value="LOCAL_MEM">Polars (Memoria Rápida)</option>
          <option value="SQL">SQLite (Persistente)</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tables.map((table) => (
          <div key={table.id} style={{ position: 'relative', padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
            <Handle type="target" position={Position.Left} id={`in-${table.id}`} style={{ background: '#10b981', width: '10px', height: '10px', border: '2px solid #fff', left: '-5px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: '500', fontSize: '14px', color: table.paused ? '#9ca3af' : '#111827' }}>
                {table.name} <span style={{ color: '#38bdf8', fontSize: '11px', marginLeft: '6px', fontWeight: 'bold' }}>[{table.count}]</span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => togglePause(table.id)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px', color: table.paused ? '#ef4444' : '#6b7280' }}>{table.paused ? '▶' : '⏸'}</button>
                <button onClick={() => removeTable(table.id)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '12px', color: '#ef4444' }}>✕</button>
              </div>
            </div>
            <Handle type="source" position={Position.Right} id={`out-${table.id}`} style={{ background: '#10b981', width: '10px', height: '10px', border: '2px solid #fff', right: '-5px' }} />
          </div>
        ))}
      </div>
      
      <div style={{ position: 'relative', padding: '12px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
        <Handle type="target" position={Position.Left} id="auto-add" style={{ background: '#10b981', width: '12px', height: '12px', border: '2px solid #fff', left: '-6px' }} />
        
        {isAdding ? (
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            <input autoFocus placeholder="Ej. SP500_Daily" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} style={{ padding: '6px', fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={confirmAddTable} style={{ flex: 1, padding: '6px', backgroundColor: '#38bdf8', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Añadir</button>
              <button onClick={() => setIsAdding(false)} style={{ flex: 1, padding: '6px', backgroundColor: '#e5e7eb', color: '#4b5563', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setIsAdding(true)} style={{ width: '100%', padding: '8px', background: 'none', border: '1px dashed #cbd5e1', borderRadius: '6px', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>+ Añadir Tabla / Auto-conectar ←</button>
        )}
      </div>

      <div style={{ position: 'relative', padding: '12px 16px', backgroundColor: '#1e293b', borderRadius: '0 0 12px 12px', textAlign: 'center' }}>
        <Handle type="target" position={Position.Left} id="console-in" style={{ background: '#f59e0b', width: '10px', height: '10px', border: '2px solid #1e293b', left: '-5px' }} />
        <div style={{ color: '#94a3b8', fontSize: '11px', letterSpacing: '0.1em', fontWeight: 'bold' }}>SQL CONSOLE INTERFACE</div>
        <Handle type="source" position={Position.Right} id="console-out" style={{ background: '#f59e0b', width: '10px', height: '10px', border: '2px solid #1e293b', right: '-5px' }} />
      </div>
    </div>
  );
}