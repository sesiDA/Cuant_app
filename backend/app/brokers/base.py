import asyncio
from abc import ABC, abstractmethod
from typing import Callable

class BaseBrokerAdapter(ABC):
    def __init__(self):
        self.active_tasks = {}

    @abstractmethod
    async def fetch_latest_candle(self, symbol: str, timeframe: str) -> dict:
        pass

    @abstractmethod
    async def _market_loop(self, symbol: str, timeframe: str, callback: Callable, error_callback: Callable):
        pass

    # Añadido market_id y error_callback a la firma
    def subscribe(self, market_id: str, symbol: str, timeframe: str, callback: Callable, error_callback: Callable):
        if market_id not in self.active_tasks:
            task = asyncio.create_task(self._market_loop(symbol, timeframe, callback, error_callback))
            self.active_tasks[market_id] = task

    def unsubscribe(self, market_id: str):
        if market_id in self.active_tasks:
            self.active_tasks[market_id].cancel()
            del self.active_tasks[market_id]