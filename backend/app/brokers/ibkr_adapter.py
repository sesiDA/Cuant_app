import asyncio
import time
from typing import Callable
from ib_insync import IB, Stock, Forex, Contract, util
from app.brokers.base import BaseBrokerAdapter

class IBKRAdapter(BaseBrokerAdapter):
    TF_MAP = {
        "1m": "1 min", "5m": "5 mins", "15m": "15 mins",
        "30m": "30 mins", "1h": "1 hour", "1d": "1 day",
    }

    def __init__(self):
        super().__init__()
        self.ib = IB()
        try:
            # Necesario para que ib_insync conviva con el event loop de FastAPI
            util.patch_asyncio()
            # 7497 es el puerto por defecto de TWS Paper Trading. (Usa 7496 para Real)
            self.ib.connect('127.0.0.1', 7497, clientId=1)
        except Exception as e:
            raise ConnectionError(f"Fallo al conectar con IBKR TWS: {e}")

    async def verify_symbol(self, symbol: str) -> Contract:
        """Intenta calificar el contrato en los servidores de IBKR."""
        # Heurística básica: 6 caracteres suele ser Forex (ej. EURUSD)
        if len(symbol) == 6:
            contract = Forex(symbol[:3], symbol[3:])
        else:
            contract = Stock(symbol, 'SMART', 'USD')
        
        contracts = await self.ib.qualifyContractsAsync(contract)
        if not contracts:
            return None
        return contracts[0]

    async def fetch_latest_candle(self, contract: Contract, timeframe: str) -> dict:
        tf_string = self.TF_MAP.get(timeframe)
        if not tf_string:
            raise ValueError(f"Temporalidad {timeframe} no soportada en IBKR")

        # Pedimos el histórico corto para sacar la última vela
        bars = await self.ib.reqHistoricalDataAsync(
            contract,
            endDateTime='',
            durationStr='2 D' if 'd' in timeframe else '10000 S',
            barSizeSetting=tf_string,
            whatToShow='MIDPOINT', # MIDPOINT funciona bien para Forex. Para acciones usar 'TRADES'
            useRTH=True,
            formatDate=1
        )
        
        if not bars:
            raise ValueError(f"No se obtuvieron datos de IBKR para {contract.symbol}")
        
        last_bar = bars[-1]
        return {
            "time": last_bar.date.isoformat() if hasattr(last_bar.date, 'isoformat') else str(last_bar.date),
            "open": last_bar.open,
            "high": last_bar.high,
            "low": last_bar.low,
            "close": last_bar.close,
            "volume": float(last_bar.volume)
        }

    async def _market_loop(self, symbol: str, timeframe: str, callback: Callable, error_callback: Callable):
        tf_seconds = {
            "1m": 60, "5m": 300, "15m": 900, "30m": 1800, 
            "1h": 3600, "1d": 86400
        }.get(timeframe, 60)

        try:
            contract = await self.verify_symbol(symbol)
            if not contract:
                await error_callback(symbol, timeframe, f"El mercado '{symbol}' no fue validado en IBKR.")
                return

            while True:
                current_time = time.time()
                time_to_next_candle = tf_seconds - (current_time % tf_seconds)
                await asyncio.sleep(time_to_next_candle)

                try:
                    candle = await self.fetch_latest_candle(contract, timeframe)
                    await callback(symbol, timeframe, candle)
                except Exception as e:
                    await error_callback(symbol, timeframe, str(e))
                    
        except asyncio.CancelledError:
            print(f"Suscripción IBKR cancelada: {symbol} {timeframe}")