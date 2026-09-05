import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ReactFlow, Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges, ReactFlowProvider, useReactFlow, BaseEdge, getBezierPath, EdgeLabelRenderer, MarkerType } from '@xyflow/react';
import type { Node, Edge, Connection, EdgeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import ProviderNode from './components/nodes/ProviderNode';
import ChartNode from './components/nodes/ChartNode';
import BufferNode from './components/nodes/BufferNode';
import HistoricalNode from './components/nodes/HistoricalNode';
import ConsoleNode from './components/nodes/ConsoleNode';
import MultiplexerNode from './components/nodes/MultiplexerNode';
import DemultiplexerNode from './components/nodes/DemultiplexerNode';

// --- CONFIGURACIÓN VISUAL DE LOS CABLES ---
const defaultEdgeStyle = { stroke: '#cbd5e1', strokeWidth: 2 };
const defaultMarker = { type: MarkerType.ArrowClosed, color: '#cbd5e1' };

const activeEdgeStyle = { stroke: '#38bdf8', strokeWidth: 3 };
const activeMarker = { type: MarkerType.ArrowClosed, color: '#38bdf8' };
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, animated }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      {/* Añadimos la clase custom cuando animated es true */}
      <BaseEdge 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={style} 
        className={animated ? 'animated-data-flow' : ''} 
      />
      <EdgeLabelRenderer>
        <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }} className="nodrag nopan">
          <button onClick={() => setEdges((edges) => edges.filter((e) => e.id !== id))} title="Eliminar conexión" style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', color: '#9ca3af', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fecaca'; }} onMouseOut={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = '#e5e7eb'; }}>
            ✕
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
const nodeTypes = { 
  provider: ProviderNode, chart: ChartNode, buffer: BufferNode, 
  historical: HistoricalNode, console: ConsoleNode,
  multiplexer: MultiplexerNode, demultiplexer: DemultiplexerNode 
};
const edgeTypes = { deletable: DeletableEdge };

function FlowCanvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNode, updateNodeData } = useReactFlow();
  const wsRef = useRef<WebSocket | null>(null);
  
  // EVENTOS DEL WEBSOCKET
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:5173/ws');
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type === 'NEW_CANDLE') {
        setNodes(nds => nds.map(n => n.type === 'provider' ? { ...n, data: { ...n.data, marketUpdate: { id: payload.marketId, timestamp: Date.now() } } } : n));

        setEdges(eds => {
          let hasConnections = false;
          const updatedEdges = eds.map(e => {
            if (e.sourceHandle === `handle-${payload.marketId}`) {
              hasConnections = true;
              return { ...e, animated: true, style: activeEdgeStyle, markerEnd: activeMarker };
            }
            return e;
          });

          if (hasConnections) {
            setNodes(nds => nds.map(n => {
              const incomingEdge = updatedEdges.find(ce => ce.target === n.id && ce.sourceHandle === `handle-${payload.marketId}`);
              if (incomingEdge) {
                const standardPayload = {
                  msgId: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`, // NUEVO: DNI del mensaje
                  dataType: 'single',
                  sourceId: payload.marketId,
                  targetHandle: incomingEdge.targetHandle,
                  symbol: payload.symbol,
                  timeframe: payload.timeframe,
                  data: payload.data
                };
                return { ...n, data: { ...n.data, incomingData: standardPayload } };
              }
              return n;
            }));
            
            setTimeout(() => {
              setEdges(currentEdges => currentEdges.map(e => e.sourceHandle === `handle-${payload.marketId}` ? { ...e, animated: false, style: defaultEdgeStyle, markerEnd: defaultMarker } : e));
            }, 2000);
          }
          return updatedEdges;
        });
      } else if (payload.type === 'BUFFER_UPDATED') {
        setEdges(eds => {
          let hasConnections = false;
          const updatedEdges = eds.map(e => {
            if (e.sourceHandle === `out-${payload.tableId}`) {
              hasConnections = true;
              return { ...e, animated: true, style: activeEdgeStyle, markerEnd: activeMarker };
            }
            return e;
          });

          // Siempre actualizamos el conteo del Buffer, incluso si no hay gráficos conectados
          setNodes(nds => nds.map(n => {
            let updatedData = { ...n.data };
            
            if (n.type === 'buffer') {
              updatedData.loadedTable = { id: payload.tableId, count: payload.data.length };
            }

            if (hasConnections) {
              const incomingEdge = updatedEdges.find(ce => ce.target === n.id && ce.sourceHandle === `out-${payload.tableId}`);
              if (incomingEdge) {
                const standardPayload = {
                  msgId: `msg_acc_${Date.now()}_${Math.random().toString(36).substring(7)}`, // NUEVO
                  dataType: 'accumulated',
                  sourceId: payload.tableId,
                  targetHandle: incomingEdge.targetHandle,
                  data: payload.data
                };
                return { ...n, data: { ...n.data, incomingData: standardPayload } };
              }
            }
            return { ...n, data: updatedData };
          }));
          
          if (hasConnections) {
            setTimeout(() => {
              setEdges(currentEdges => currentEdges.map(e => e.sourceHandle === `out-${payload.tableId}` ? { ...e, animated: false, style: defaultEdgeStyle, markerEnd: defaultMarker } : e));
            }, 2000);
          }
          return updatedEdges;
        });
      } else if (payload.type === 'HISTORICAL_PROGRESS') {
        setNodes(nds => nds.map(n => n.type === 'historical' ? { ...n, data: { ...n.data, histProgress: { id: payload.marketId, pct: payload.progress } } } : n));
      } else if (payload.type === 'HISTORICAL_COMPLETE') {
        setNodes(nds => nds.map(n => n.type === 'historical' ? { ...n, data: { ...n.data, histComplete: { id: payload.marketId } } } : n));

        setEdges(eds => {
          let hasConnections = false;
          const updatedEdges = eds.map(e => {
            if (e.sourceHandle === `handle-${payload.marketId}`) {
              hasConnections = true;
              return { ...e, animated: true, style: { stroke: '#8b5cf6', strokeWidth: 3 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' } };
            }
            return e;
          });

          if (hasConnections) {
            setNodes(nds => nds.map(n => {
              const incomingEdge = updatedEdges.find(ce => ce.target === n.id && ce.sourceHandle === `handle-${payload.marketId}`);
              if (incomingEdge) {
                // Al ser muchos datos, el payload estándar ES de tipo acumulado
                const standardPayload = {
                  msgId: `hist_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                  dataType: 'accumulated',
                  sourceId: payload.symbol + '_' + payload.timeframe, // Para autodescubrimiento
                  targetHandle: incomingEdge.targetHandle,
                  symbol: payload.symbol,
                  timeframe: payload.timeframe,
                  data: payload.data
                };
                return { ...n, data: { ...n.data, incomingData: standardPayload } };
              }
              return n;
            }));
            
            setTimeout(() => {
              setEdges(currentEdges => currentEdges.map(e => e.sourceHandle === `handle-${payload.marketId}` ? { ...e, animated: false, style: defaultEdgeStyle, markerEnd: defaultMarker } : e));
            }, 3000); // Animación lila más duradera para inyecciones masivas
          }
          return updatedEdges;
        });
      }else if (payload.type === 'CONSOLE_RESULT') {
        // 1. Iluminar el cable desde el Buffer hasta la Consola
        setEdges(eds => eds.map(e => (e.source === payload.bufferId && e.target === payload.nodeId) ? { ...e, animated: true, style: activeEdgeStyle, markerEnd: activeMarker } : e));
        
        setTimeout(() => {
          setEdges(eds => eds.map(e => (e.source === payload.bufferId && e.target === payload.nodeId) ? { ...e, animated: false, style: defaultEdgeStyle, markerEnd: defaultMarker } : e));
        }, 2000);

        // 2. Inyectar el dato en la Consola
        setNodes(nds => {
          let refreshNeeded = false;
          if (Array.isArray(payload.result) && payload.result.length > 0 && payload.result[0].mutated) refreshNeeded = true;
          
          return nds.map(n => {
            if (n.id === payload.nodeId) {
              const standardPayload = { msgId: `c_res_${Date.now()}`, dataType: 'console_result', data: payload.result };
              return { ...n, data: { ...n.data, incomingData: standardPayload } };
            }
            if (refreshNeeded && n.type === 'buffer') return { ...n, data: { ...n.data, refreshTrigger: Date.now() } };
            return n;
          });
        });
      } else if (payload.type === 'ERROR') {
        setNodes(nds => nds.map(n => (n.type === 'provider' || n.type === 'historical') ? { ...n, data: { ...n.data, marketError: { id: payload.marketId, message: payload.message } } } : n));
      }
    };
    return () => ws.close();
  }, [setNodes, setEdges]);

  // --- BUS DE EVENTOS FRONT-TO-FRONT ---
  useEffect(() => {
    const handleForward = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { sourceHandle, payload } = customEvent.detail;

      setEdges(eds => {
        let hasConnections = false;
        
        // Identificamos el color y el grosor del cable según el tipo de datos
        const isMux = payload.dataType === 'multiplexed';
        const activeColor = isMux ? '#f59e0b' : (payload.dataType === 'accumulated' ? '#8b5cf6' : '#38bdf8');
        // El grosor base es 3. Si está multiplexado, es proporcional a la cantidad de cables.
        const baseThickness = isMux ? Math.max(4, (payload.multiplexCount || 1) * 2) : 3;

        const updatedEdges = eds.map(edge => {
          if (edge.sourceHandle === sourceHandle) {
            hasConnections = true;
            return { 
              ...edge, 
              animated: true, 
              style: { stroke: activeColor, strokeWidth: baseThickness + 1 }, // Ligeramente más gordo al animarse
              markerEnd: { type: MarkerType.ArrowClosed, color: activeColor } 
            };
          }
          return edge;
        });

        if (hasConnections) {
          setNodes(nds => nds.map(n => {
            const incomingEdge = updatedEdges.find(ce => ce.target === n.id && ce.sourceHandle === sourceHandle);
            if (incomingEdge) {
              const standardPayload = { ...payload, targetHandle: incomingEdge.targetHandle };
              return { ...n, data: { ...n.data, incomingData: standardPayload } };
            }
            return n;
          }));

          // Restauramos la animación, PERO CONSERVAMOS EL GROSOR EN REPOSO
          setTimeout(() => {
            setEdges(currentEdges => currentEdges.map(edge => 
              edge.sourceHandle === sourceHandle 
                ? { ...edge, animated: false, style: { stroke: '#cbd5e1', strokeWidth: baseThickness }, markerEnd: { type: MarkerType.ArrowClosed, color: '#cbd5e1' } } 
                : edge
            ));
          }, 2000);
        }
        return updatedEdges;
      });
    };

    window.addEventListener('forwardData', handleForward);
    return () => window.removeEventListener('forwardData', handleForward);
  }, [setNodes, setEdges]);
  const onNodesChange = useCallback((changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    // 1. Apagar la transmisión del backend si se corta el cable de un proveedor
    deletedEdges.forEach(edge => {
      if (edge.sourceHandle?.startsWith('handle-')) {
        const marketId = edge.sourceHandle.replace('handle-', '');
        wsRef.current?.send(JSON.stringify({ action: 'unsubscribe', marketId }));
      }
    });

    // 2. Limpiar el puerto de destino para que el nodo sepa que ya no recibe datos
    setNodes(nds => nds.map(n => {
      if (deletedEdges.some(e => e.target === n.id)) {
        const newData = { ...n.data };
        delete newData.incomingData;
        return { ...n, data: newData };
      }
      return n;
    }));
  }, [setNodes]);
  const onConnect = useCallback((connection: Connection) => {
    let modifiedConnection = { ...connection };

    // MAGIA DE AUTO-DESCUBRIMIENTO EN CALIENTE
    if (connection.targetHandle === 'auto-add') {
      const sourceNode = getNode(connection.source);
      if (sourceNode?.data?.markets) {
        // Buscamos a qué mercado pertenece el cable que estamos arrastrando
        const marketsArray = sourceNode.data.markets as any[];
        const market = marketsArray.find((m: any) => `handle-${m.id}` === connection.sourceHandle);
        if (market) {
          const tableName = `${market.symbol}_${market.timeframe}`;
          const tableId = tableName.replace(/[^a-zA-Z0-9_]/g, '_'); // ID consistente (case-sensitive)

          // 1. Pedimos al Buffer que cree la tabla y la cargue
          updateNodeData(connection.target, { 
            autoAddRequest: { id: tableId, name: tableName, timestamp: Date.now() } 
          });

          // 2. Cambiamos el destino del cable visualmente antes de crearlo
          modifiedConnection.targetHandle = `in-${tableId}`;
        }
      }
    }

    const newEdge = { ...modifiedConnection, type: 'deletable', animated: false, style: defaultEdgeStyle, markerEnd: defaultMarker };
    setEdges((eds) => addEdge(newEdge, eds));
  }, [getNode, updateNodeData, setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const newNode: Node = { id: `${type}-${Date.now()}`, type, position, data: { wsSend: (msg: any) => wsRef.current?.send(JSON.stringify(msg)) } };
    setNodes((nds) => nds.concat(newNode));
  }, [screenToFlowPosition]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', fontFamily: 'Inter, system-ui, sans-serif' }} ref={reactFlowWrapper}>
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onEdgesDelete={onEdgesDelete} onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView>
        <Background gap={16} color="#e5e7eb" />
        {/* NUEVO: Controles desplazados hacia arriba para no chocar con la barra */}
        <Controls style={{ marginBottom: '80px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} showInteractive={false} />
      </ReactFlow>
      <Toolbar />
    </div>
  );
}

//Barra de herramientas flotante para arrastrar nodos al lienzo
function Toolbar() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, width: '100%',
      backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(8px)',
      padding: '16px 24px', borderTop: '1px solid #e5e7eb',
      boxShadow: '0 -4px 20px -2px rgba(0, 0, 0, 0.05)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10
    }}>
      <div style={{ display: 'flex', gap: '16px' }}>
        <div 
          onDragStart={(e) => onDragStart(e, 'provider')} draggable 
          style={{ padding: '8px 24px', backgroundColor: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'grab', fontSize: '13px', fontWeight: '500', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', transition: 'all 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#9ca3af'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
        >
          Proveedor de Datos
        </div>
        <div 
          onDragStart={(e) => onDragStart(e, 'chart')} draggable 
          style={{ padding: '8px 24px', backgroundColor: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'grab', fontSize: '13px', fontWeight: '500', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', transition: 'all 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#9ca3af'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
        >
          Visualizador de Gráfico
        </div>
        <div 
          onDragStart={(e) => onDragStart(e, 'buffer')} draggable 
          style={{ padding: '8px 24px', backgroundColor: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'grab', fontSize: '13px', fontWeight: '500', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', transition: 'all 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#9ca3af'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
        >
          Buffer de Datos
        </div>
        <div 
          onDragStart={(e) => onDragStart(e, 'historical')} draggable 
          style={{ padding: '8px 24px', backgroundColor: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'grab', fontSize: '13px', fontWeight: '500', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', transition: 'all 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#9ca3af'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
        >
          Inyector Histórico
        </div>
        <div 
          onDragStart={(e) => onDragStart(e, 'console')} draggable 
          style={{ padding: '8px 24px', backgroundColor: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'grab', fontSize: '13px', fontWeight: '500', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)', transition: 'all 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#9ca3af'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}        
        >
          Consola (SQL/Py)
        </div> 
        <div 
          onDragStart={(e) => onDragStart(e, 'multiplexer')} draggable 
          style={{ padding: '8px 24px', backgroundColor: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'grab', fontSize: '13px', fontWeight: '500', transition: 'all 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#9ca3af'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
        >
          MUX (Agrupar)
        </div>
        <div 
          onDragStart={(e) => onDragStart(e, 'demultiplexer')} draggable 
          style={{ padding: '8px 24px', backgroundColor: '#ffffff', color: '#111827', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'grab', fontSize: '13px', fontWeight: '500', transition: 'all 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = '#9ca3af'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
        >
          DEMUX (Separar)
        </div> 
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#f9fafb' }}>
      
      {/* Estilos CSS para el pulso de datos moderno */}
      <style>
        {`
          .animated-data-flow {
            stroke-dasharray: 8 8;
            animation: data-flow-anim 0.5s linear infinite;
            filter: drop-shadow(0 0 4px rgba(56, 189, 248, 0.8)); /* Resplandor azul */
          }
          @keyframes data-flow-anim {
            from { stroke-dashoffset: 16; }
            to { stroke-dashoffset: 0; }
          }
        `}
      </style>

      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </div>
  );
}