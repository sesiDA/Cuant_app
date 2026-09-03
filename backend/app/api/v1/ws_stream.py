from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from app.brokers.mt5_adapter import MT5Adapter
from app.engine.buffer import BufferManager # NUEVO

router = APIRouter()
buffer_manager = BufferManager() # NUEVO

try:
    broker = MT5Adapter()
except Exception as e:
    print(f"⚠️ Atención: MT5 no inicializado. Error: {e}")
    broker = None

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    # ... (funciones on_new_candle y on_error quedan igual) ...
    async def on_new_candle(market_id: str, symbol: str, timeframe: str, candle_data: dict):
        await websocket.send_text(json.dumps({
            "type": "NEW_CANDLE",
            "marketId": market_id,
            "symbol": symbol,          # NUEVO
            "timeframe": timeframe,    # NUEVO
            "data": candle_data
        }))

    async def on_error(market_id: str, symbol: str, timeframe: str, error_msg: str):
        await websocket.send_text(json.dumps({"type": "ERROR", "marketId": market_id, "message": error_msg}))

    try:
        while True:
            data = await websocket.receive_text()
            command = json.loads(data)
            action = command.get("action")
            # --- COMANDO DE VERIFICACIÓN DE MERCADO ---
            if action == "verify_symbol":
                market_id = command.get("marketId")
                symbol = command.get("symbol")
                if not broker:
                    continue
                try:
                    exists = await broker.verify_symbol(symbol)
                    if not exists:
                        await websocket.send_text(json.dumps({
                            "type": "ERROR", "marketId": market_id, "message": f"El mercado '{symbol}' no existe"
                        }))
                except Exception as e:
                    await websocket.send_text(json.dumps({
                        "type": "ERROR", "marketId": market_id, "message": str(e)
                    }))
                continue
           # --- COMANDOS DE BUFFER ---
            if action == "buffer_append":
                table_id = command.get("tableId")
                new_data = command.get("data")
                db_mode = command.get("mode", "LOCAL_MEM")
                
                full_array = buffer_manager.append_data(table_id, new_data, db_mode)
                await websocket.send_text(json.dumps({"type": "BUFFER_UPDATED", "tableId": table_id, "data": full_array}))
                continue
            elif action == "buffer_append_batch":
                table_id = command.get("tableId")
                new_data = command.get("data") # Esto ahora es un array
                db_mode = command.get("mode", "LOCAL_MEM")
                
                # Llamamos a la nueva función masiva
                buffer_manager.append_batch(table_id, new_data, db_mode)
                
                # Enviamos una confirmación ligera, no todo el DB
                await websocket.send_text(json.dumps({
                    "type": "BUFFER_BATCH_COMPLETE",
                    "tableId": table_id,
                    "count": len(new_data)
                }))
                continue
            elif action == "buffer_clear":
                # ARREGLADO: Ahora se le pasa el modo correctamente para evitar el crash
                buffer_manager.clear_table(command.get("tableId"), command.get("mode", "LOCAL_MEM"))
                continue
                
            elif action == "buffer_load": # NUEVO
                table_id = command.get("tableId")
                db_mode = command.get("mode", "LOCAL_MEM")
                
                full_array = buffer_manager.load_table(table_id, db_mode)
                await websocket.send_text(json.dumps({"type": "BUFFER_UPDATED", "tableId": table_id, "data": full_array}))
                continue
            # --- COMANDOS DE HISTÓRICOS (INYECCIÓN MASIVA) ---
            if action == "historical_load":
                market_id = command.get("marketId")
                symbol = command.get("symbol")
                timeframe = command.get("timeframe")
                amount = int(command.get("amount", 1))
                unit = command.get("unit", "d")
                
                async def send_progress(pct: int):
                    await websocket.send_text(json.dumps({
                        "type": "HISTORICAL_PROGRESS", "marketId": market_id, "progress": pct
                    }))
                    
                try:
                    data_array = await broker.fetch_historical_data(symbol, timeframe, amount, unit, send_progress)
                    
                    await websocket.send_text(json.dumps({
                        "type": "HISTORICAL_COMPLETE",
                        "marketId": market_id,
                        "symbol": symbol,
                        "timeframe": timeframe,
                        "data": data_array
                    }))
                except Exception as e:
                    await websocket.send_text(json.dumps({
                        "type": "ERROR", "marketId": market_id, "message": str(e)
                    }))
                continue    
            
            # --- COMANDOS DE BROKER EXISTENTES ---
            if not broker:
                await websocket.send_text(json.dumps({"type": "GLOBAL_ERROR", "message": "MT5 no conectado."}))
                continue

            market_id = command.get("marketId")
            symbol = command.get("symbol")
            timeframe = command.get("timeframe")

            if action == "subscribe":
                async def cb_success(s, t, d, mid=market_id): await on_new_candle(mid, s, t, d)
                async def cb_error(s, t, err, mid=market_id): await on_error(mid, s, t, err)
                broker.subscribe(market_id, symbol, timeframe, cb_success, cb_error)
            elif action == "unsubscribe":
                broker.unsubscribe(market_id)

    except WebSocketDisconnect:
        pass