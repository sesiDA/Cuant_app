import { useEffect, useRef, useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';

export default function ChartNode({ id, data }: { id: string, data: any }) {
  const { setNodes } = useReactFlow();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  
  // NUEVO: Estado de pausa global del gráfico
  const [isPaused, setIsPaused] = useState(false);
  const [marketLabel, setMarketLabel] = useState<string | null>(null); // NUEVO ESTADO
  
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const containerWidth = chartContainerRef.current.clientWidth;

    const chart = createChart(chartContainerRef.current, {
      width: containerWidth, 
      height: 250,
      layout: { background: { color: '#ffffff' }, textColor: '#333' },
      grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    
    chartRef.current = chart;

    if (chartType === 'candlestick') {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444'
      });
    } else {
      seriesRef.current = chart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 2 });
    }

    return () => chart.remove();
  }, [chartType]);

  useEffect(() => {
    if (isPaused || !seriesRef.current || !data?.incomingData) return;
    
    try {
      const payload = data.incomingData; // Aquí leemos nuestro JSON estandarizado
      // AUTO-DESCUBRIMIENTO DEL TÍTULO
      if (payload.dataType === 'single' && payload.symbol && payload.timeframe) {
        setMarketLabel(`${payload.symbol} ${payload.timeframe}`);
      } else if (payload.dataType === 'accumulated' && payload.sourceId) {
        // Convierte "EURUSD_1m" en "EURUSD 1m"
        setMarketLabel(payload.sourceId.replace('_', ' '));
      }
      if (payload.dataType === 'single') {
        // --- CASO 1: Vela suelta (Directo del Provider) ---
        const candle = payload.data;
        const timeSecs = Math.floor(new Date(candle.time).getTime() / 1000) as Time;
        
        let formattedData = chartType === 'candlestick' 
          ? { time: timeSecs, open: candle.open, high: candle.high, low: candle.low, close: candle.close }
          : { time: timeSecs, value: candle.close };

        seriesRef.current.update(formattedData);

      } else if (payload.dataType === 'accumulated') {
        // --- CASO 2: Array de velas (Desde el Buffer) ---
        const candlesArray = payload.data as any[];
        
        // Mapeamos el array para parsear las fechas de TODOS los elementos
        let formattedArray = candlesArray.map(candle => {
          const timeSecs = Math.floor(new Date(candle.time).getTime() / 1000) as Time;
          if (chartType === 'candlestick') {
            return { time: timeSecs, open: candle.open, high: candle.high, low: candle.low, close: candle.close };
          } else {
            return { time: timeSecs, value: candle.close };
          }
        });

        // TradingView falla si los datos no están estrictamente ordenados de más antiguo a más nuevo
        formattedArray.sort((a, b) => (a.time as number) - (b.time as number));

        // Borramos los duplicados de tiempo que puedan existir por latencia (TradingView no permite dos velas con el mismo exacto timestamp)
        formattedArray = formattedArray.filter((item, index, self) =>
          index === self.findIndex((t) => (t.time === item.time))
        );

        // Usamos setData para reemplazar todo el histórico del gráfico
        seriesRef.current.setData(formattedArray);
      }
      
    } catch (e) {
      console.error("Error graficando datos estructurados:", e);
    }
  }, [data?.incomingData, chartType, isPaused]);
  return (
    <div style={{
      backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px',
      width: '400px', fontFamily: 'Inter, system-ui, sans-serif',
      boxShadow: '0 10px 15px -3px rgba(56, 189, 248, 0.1)', overflow: 'hidden'
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: '#38bdf8', width: '10px', height: '10px', border: '2px solid #fff', left: '-5px' }} />
      
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Visualizador
          
          {/* NUEVO: Label de Autodescubrimiento */}
          {marketLabel && (
            <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 'bold' }}>
              {marketLabel}
            </span>
          )}

          {isPaused && <span style={{ color: '#ef4444', fontSize: '10px', padding: '2px 6px', backgroundColor: '#fef2f2', borderRadius: '4px' }}>PAUSADO</span>}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select 
            value={chartType} onChange={(e) => setChartType(e.target.value as 'candlestick' | 'line')}
            style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #e5e7eb', borderRadius: '4px', outline: 'none' }}
          >
            <option value="candlestick">Velas</option>
            <option value="line">Línea</option>
          </select>
          
          {/* NUEVO: Botón de pausa global del nodo */}
          <button 
            onClick={() => setIsPaused(!isPaused)} title={isPaused ? "Reanudar recepción" : "Pausar recepción"}
            style={{ background: isPaused ? '#fef2f2' : '#f0f9ff', border: `1px solid ${isPaused ? '#fecaca' : '#bae6fd'}`, borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px', color: isPaused ? '#ef4444' : '#0369a1' }}
          >
            {isPaused ? '▶' : '⏸'}
          </button>

          <button 
            onClick={() => setNodes((nodes) => nodes.filter((n) => n.id !== id))} title="Eliminar herramienta"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px', color: '#ef4444' }}
          >
            ✕
          </button>
        </div>
      </div>
      
      <div ref={chartContainerRef} className="nodrag nowheel" style={{ width: '100%', height: '250px', cursor: 'crosshair' }} />
    </div>
  );
}