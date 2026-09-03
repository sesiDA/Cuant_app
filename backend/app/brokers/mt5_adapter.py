import time, os, asyncio
from datetime import datetime
import MetaTrader5 as mt5
from typing import Callable
from app.brokers.base import BaseBrokerAdapter
from dotenv import load_dotenv

load_dotenv()

class MT5Adapter(BaseBrokerAdapter):
    # MetaTrader no soporta velas de 5 segundos de forma nativa. 
    # Mapeamos las temporalidades estándar de la industria.
    TF_MAP = {
        "1m": mt5.TIMEFRAME_M1,
        "5m": mt5.TIMEFRAME_M5,
        "15m": mt5.TIMEFRAME_M15,
        "30m": mt5.TIMEFRAME_M30,
        "1h": mt5.TIMEFRAME_H1,
        "4h": mt5.TIMEFRAME_H4,
        "1d": mt5.TIMEFRAME_D1,
    }

    def __init__(self):
        super().__init__()
        # Inicializamos la conexión con el terminal de MT5
        try:
            login=int(os.getenv("MT5_LOGIN"))
            password= os.getenv("MT5_PASSWORD")
            server=os.getenv("MT5_SERVER")
            path=os.getenv("MT5_PATH")
        except TypeError:
            raise TypeError("Faltan variables de entorno en .env para el logging de MT5")
        autorized = mt5.initialize(path=path, login=login, password=password, server=server)
        if not mt5.initialize():
            raise ConnectionError(f"Fallo al inicializar MT5: {mt5.last_error()}")
    def get_supported_timeframes(self) -> list:
        return list(self.TF_MAP.keys())

    async def verify_symbol(self, symbol: str) -> bool:
        """Verifica si el mercado existe y lo añade al Market Watch."""
        def _verify():
            info = mt5.symbol_info(symbol)
            if info is None:
                return False
            if not info.visible:
                mt5.symbol_select(symbol, True)
            return True
        
        return await asyncio.to_thread(_verify)

    async def fetch_latest_candle(self, symbol: str, timeframe: str) -> dict:
        tf_code = self.TF_MAP.get(timeframe)
        if not tf_code:
            raise ValueError(f"Temporalidad {timeframe} no soportada en MT5")

        def _fetch():
            # Extraemos la vela que acaba de cerrar
            rates = mt5.copy_rates_from_pos(symbol, tf_code, 0, 1)
            if rates is None or len(rates) == 0:
                raise ValueError(f"No se pudieron obtener datos para {symbol}")
            return rates[0]

        rate = await asyncio.to_thread(_fetch)
        
        # SOLUCIÓN: Convertimos explícitamente los tipos de NumPy a int y float nativos de Python
        return {
            "time": datetime.fromtimestamp(int(rate['time'])).isoformat(),
            "open": float(rate['open']),
            "high": float(rate['high']),
            "low": float(rate['low']),
            "close": float(rate['close']),
            "volume": int(rate['tick_volume'])
        }

    async def _market_loop(self, symbol: str, timeframe: str, callback: Callable, error_callback: Callable):
        """Sincroniza la extracción exactamente con el reloj del servidor MT5."""
        # Convertimos la temporalidad a segundos
        tf_seconds = {
            "1m": 60, "5m": 300, "15m": 900, "30m": 1800, 
            "1h": 3600, "4h": 14400, "1d": 86400
        }.get(timeframe, 60)

        try:
            # 1. Verificación inicial
            exists = await self.verify_symbol(symbol)
            if not exists:
                await error_callback(symbol, timeframe, f"El mercado '{symbol}' no existe en este bróker.")
                return

            while True:
                # 2. Sincronización perfecta de reloj
                # Calculamos cuántos segundos faltan para el cierre de la vela actual
                current_time = time.time()
                time_to_next_candle = tf_seconds - (current_time % tf_seconds)
                
                # Dormimos la tarea asíncrona hasta que se complete la vela
                await asyncio.sleep(time_to_next_candle)

                # 3. Extraemos el dato y lo enviamos
                try:
                    candle = await self.fetch_latest_candle(symbol, timeframe)
                    await callback(symbol, timeframe, candle)
                except Exception as e:
                    await error_callback(symbol, timeframe, str(e))
                    
        except asyncio.CancelledError:
            print(f"Suscripción cancelada: {symbol} {timeframe}")