from fastapi import FastAPI
import uvicorn
from app.api.v1 import ws_stream

# Inicialización de la app
app = FastAPI(title="Quant Platform Engine")

# Incluimos el router de WebSockets que definimos anteriormente
app.include_router(ws_stream.router)

if __name__ == "__main__":
    # Arranca el servidor asíncrono en el puerto 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)