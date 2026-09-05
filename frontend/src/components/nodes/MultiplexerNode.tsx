import { useEffect, useRef } from 'react';
import { Handle, Position, useEdges, useUpdateNodeInternals } from '@xyflow/react';

export default function MultiplexerNode({ id, data }: { id: string, data: any }) {
  const edges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();
  const stateRef = useRef<Record<string, any>>({});
  const lastProcessedRef = useRef<string | null>(null);

  const incomingEdgesCount = edges.filter(e => e.target === id).length;
  const outgoingEdgesCount = edges.filter(e => e.source === id).length;
  const inputCount = Math.max(1, incomingEdgesCount + 1);
  const h = Math.max(120, inputCount * 35);

  useEffect(() => { updateNodeInternals(id); }, [inputCount, id, updateNodeInternals]);

  // 1. ONDA DE CONFIGURACIÓN (Se dispara al conectar/desconectar cables)
  useEffect(() => {
    if (outgoingEdgesCount > 0) {
      window.dispatchEvent(new CustomEvent('forwardData', {
        detail: {
          sourceHandle: `out-mux`,
          payload: {
            msgId: `config_mux_${Date.now()}`,
            dataType: 'config',
            sourceId: `MUX_${id}`,
            targetHandle: '',
            multiplexCount: incomingEdgesCount, // Enviamos cuántos cables reales hay
            data: null
          }
        }
      }));
    }
  }, [incomingEdgesCount, outgoingEdgesCount, id]);

  // 2. PROCESAMIENTO DE DATOS REALES
  useEffect(() => {
    if (!data?.incomingData) return;
    const payload = data.incomingData;

    if (!payload.msgId || lastProcessedRef.current === payload.msgId) return;
    lastProcessedRef.current = payload.msgId;

    if (payload.targetHandle) stateRef.current[payload.targetHandle] = payload;
    const allStreams = Object.values(stateRef.current);

    window.dispatchEvent(new CustomEvent('forwardData', {
      detail: {
        sourceHandle: `out-mux`,
        payload: {
          msgId: `mux_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          dataType: 'multiplexed',
          sourceId: `MUX_${id}`,
          targetHandle: '',
          symbol: 'MULTIPLEX',
          timeframe: 'Mixed',
          multiplexCount: allStreams.length,
          data: allStreams
        }
      }
    }));
  }, [data?.incomingData, id]);

  return (
    <div style={{ width: '120px', height: `${h}px`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* ESTILO VISUAL CORREGIDO: Borde e5e7eb, Sombra sutil estándar */}
      <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, zIndex: -1, filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.05))' }}>
        <polygon 
          points={`0,0 120,${h * 0.25} 120,${h * 0.75} 0,${h}`} 
          fill="#ffffff" stroke="#e5e7eb" strokeWidth="1" 
        />
      </svg>
      
      <div style={{ fontWeight: '600', color: '#6b7280', fontSize: '12px', letterSpacing: '0.05em' }}>MUX</div>

      {Array.from({ length: inputCount }).map((_, i) => (
        <Handle key={`in-${i}`} type="target" position={Position.Left} id={`in-${i}`} style={{ top: `${((i + 1) / (inputCount + 1)) * 100}%`, background: '#10b981', width: '10px', height: '10px', border: '2px solid #fff', left: '-5px' }} />
      ))}
      <Handle type="source" position={Position.Right} id="out-mux" style={{ top: '50%', background: '#f59e0b', width: '14px', height: '14px', border: '2px solid #fff', right: '-7px' }} />
    </div>
  );
}