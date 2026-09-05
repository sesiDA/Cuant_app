import { useEffect, useRef, useState } from 'react';
import { Handle, Position, useEdges, useUpdateNodeInternals } from '@xyflow/react';

export default function DemultiplexerNode({ id, data }: { id: string, data: any }) {
  const edges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();
  const [activeOutputs, setActiveOutputs] = useState(1);
  
  const streamMappingRef = useRef<Record<string, string>>({});
  const nextHandleIdxRef = useRef(0);
  const lastProcessedRef = useRef<string | null>(null);

  const outgoingEdges = edges.filter(e => e.source === id);
  const outputCount = Math.max(activeOutputs, outgoingEdges.length + 1);
  const h = Math.max(120, outputCount * 35);

  useEffect(() => { updateNodeInternals(id); }, [outputCount, id, updateNodeInternals]);

  useEffect(() => {
    if (!data?.incomingData) return;
    const payload = data.incomingData;

    if (!payload.msgId || lastProcessedRef.current === payload.msgId) return;
    lastProcessedRef.current = payload.msgId;

    // 1. INTERCEPTAMOS LA ONDA DE CONFIGURACIÓN
    if (payload.dataType === 'config' && payload.multiplexCount !== undefined) {
      setActiveOutputs(Math.max(1, payload.multiplexCount));
      return; // Detenemos aquí, no hay datos que decodificar
    }

    // 2. DECODIFICACIÓN DE DATOS
    if (payload.dataType === 'multiplexed' && Array.isArray(payload.data)) {
      payload.data.forEach((stream: any) => {
        const uniqueId = stream.sourceId; 
        if (!streamMappingRef.current[uniqueId]) {
          streamMappingRef.current[uniqueId] = `out-${nextHandleIdxRef.current++}`;
          setActiveOutputs(prev => Math.max(prev, nextHandleIdxRef.current + 1));
        }

        const outHandle = streamMappingRef.current[uniqueId];

        window.dispatchEvent(new CustomEvent('forwardData', {
          detail: {
            sourceHandle: outHandle,
            payload: {
              ...stream, 
              multiplexCount: 1, // CORRECCIÓN: Obligamos a que el cable decodificado vuelva al grosor estándar
              msgId: `demux_${Date.now()}_${Math.random().toString(36).substring(7)}`
            }
          }
        }));
      });
    }
  }, [data?.incomingData]);

  return (
    <div style={{ width: '120px', height: `${h}px`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* ESTILO VISUAL CORREGIDO */}
      <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, zIndex: -1, filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.05))' }}>
        <polygon 
          points={`0,${h * 0.25} 120,0 120,${h} 0,${h * 0.75}`} 
          fill="#ffffff" stroke="#e5e7eb" strokeWidth="1" 
        />
      </svg>
      
      <div style={{ fontWeight: '600', color: '#6b7280', fontSize: '12px', letterSpacing: '0.05em' }}>DEMUX</div>

      <Handle type="target" position={Position.Left} id="in-demux" style={{ top: '50%', background: '#f59e0b', width: '14px', height: '14px', border: '2px solid #fff', left: '-7px' }} />

      {Array.from({ length: outputCount }).map((_, i) => (
        <Handle key={`out-${i}`} type="source" position={Position.Right} id={`out-${i}`} style={{ top: `${((i + 1) / (outputCount + 1)) * 100}%`, background: '#10b981', width: '10px', height: '10px', border: '2px solid #fff', right: '-5px' }} />
      ))}
    </div>
  );
}