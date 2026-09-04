import { useState, useEffect, useRef } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';

export default function ConsoleNode({ id, data }: { id: string, data: any }) {
  const { setNodes, getEdges } = useReactFlow(); // Añadido getEdges
  const [mode, setMode] = useState('SQL');
  const [code, setCode] = useState('SELECT * FROM ... LIMIT 10;');
  const [output, setOutput] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Escuchar la respuesta que envía App.tsx a través del Edge
  const lastProcessedRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (data.incomingData && data.incomingData.dataType === 'console_result' && data.incomingData.msgId !== lastProcessedRef.current) {
      lastProcessedRef.current = data.incomingData.msgId;
      const res = data.incomingData.data;
      
      setOutput(res);
      setIsExecuting(false);
      
      // Si el resultado es un set de datos (no un error o un aviso de mutación), lo enviamos por el puerto de salida
      if (Array.isArray(res) && res.length > 0 && !res[0].mutated && !res[0].output && !res[0].error) {
        window.dispatchEvent(new CustomEvent('forwardData', { 
          detail: { 
            sourceHandle: `out-${id}`, 
            payload: {
              msgId: `fwd_${Date.now()}`,
              dataType: 'accumulated',
              sourceId: `Console_${mode}`,
              targetHandle: '', 
              symbol: 'QUERY_RESULT',
              timeframe: 'Custom',
              data: res
            }
          } 
        }));
      }
    }
  }, [data.incomingData, id, mode]);

  const executeCode = () => {
    // CONDICIÓN ESTRICTA: El usuario DEBE haber conectado un Buffer a la entrada de esta Consola
    const edges = getEdges();
    const connectedEdge = edges.find(e => e.target === id && e.targetHandle === `in-${id}`);
    
    if (!connectedEdge) {
      setOutput({ error: "CONEXIÓN DENEGADA: Conecta el puerto [console-out] de un Buffer al puerto [IN] de esta Consola." });
      return;
    }

    setIsExecuting(true);
    setOutput(null);
    
    // Le pasamos al backend el ID del buffer al que estamos conectados visualmente
    data.wsSend?.({ 
      action: 'console_execute', 
      nodeId: id, 
      bufferId: connectedEdge.source, 
      mode: mode, 
      code: code 
    });
  };

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    setCode(newMode === 'SQL' ? 'SELECT * FROM ... LIMIT 10;' : "# Para ver resultados, asigna datos a 'result'\n# result = tables['tu_tabla']\nresult = None");
    setOutput(null);
  };

  const safeHighlight = (text: string) => {
    try {
      const lang = mode === 'SQL' ? Prism.languages.sql : Prism.languages.python;
      return lang ? Prism.highlight(text, lang, mode.toLowerCase()) : text;
    } catch (e) { return text; }
  };

  return (
    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', width: '450px', fontFamily: 'Inter, system-ui, sans-serif', boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* PUERTOS ETIQUETADOS (Target=Izquierda, Source=Derecha) */}
      <Handle type="target" position={Position.Right} id={`in-${id}`} style={{ background: '#f59e0b', width: '12px', height: '12px', border: '2px solid #1e293b', right: '-6px' }} />
      <Handle type="source" position={Position.Left} id={`out-${id}`} style={{ background: '#f59e0b', width: '12px', height: '12px', border: '2px solid #1e293b', left: '-6px' }} />

      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600' }}>Console</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select value={mode} onChange={(e) => handleModeChange(e.target.value)} style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: '4px', outline: 'none', backgroundColor: '#f9fafb' }}>
            <option value="SQL">SQL (Persistente)</option>
            <option value="PYTHON">Python (RAM / Pandas)</option>
          </select>
          <button onClick={() => setNodes(nodes => nodes.filter(n => n.id !== id))} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px', color: '#ef4444' }}>✕</button>
        </div>
      </div>

      <div style={{ position: 'relative', height: '160px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155' }}>
        <pre style={{ margin: 0, padding: '16px', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace', fontSize: '13px', color: '#f8fafc', overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: safeHighlight(code) }} />
        <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck="false" className="nodrag nowheel" style={{ margin: 0, padding: '16px', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace', fontSize: '13px', color: 'transparent', caretColor: '#f8fafc', background: 'transparent', border: 'none', outline: 'none', resize: 'none', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} />
      </div>

      <div className="nowheel" style={{ padding: '12px', backgroundColor: '#f8fafc', height: '150px', overflowY: 'auto', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontFamily: '"Fira Code", Consolas, monospace', color: output?.error ? '#ef4444' : '#334155' }}>
        {isExecuting ? <span style={{ color: '#9ca3af' }}>Ejecutando consulta...</span> : output ? <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{typeof output === 'string' ? output : JSON.stringify(output, null, 2)}</pre> : <span style={{ color: '#cbd5e1' }}>A la espera de output...</span>}
      </div>

      <div style={{ padding: '12px 16px', backgroundColor: '#ffffff' }}>
        <button onClick={() => executeCode()} disabled={isExecuting} style={{ width: '100%', padding: '8px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: isExecuting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '500', transition: 'background-color 0.2s' }}>
          {isExecuting ? 'Ejecutando...' : 'Send Query ➔'}
        </button>
      </div>
    </div>
  );
}