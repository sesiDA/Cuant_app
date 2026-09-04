# Estructura del Proyecto

quant-platform/ç
├── README.md         
├── .gitignore                     # Archivos que ignorar en los pullrequest de GitHub 
├── docker-compose.yml             # Servicio Docker para bases de datos
├── backend/                       # Backend en Python (FastAPI / Motores de cálculo)
│   ├── .venv/                     # Entorno virtual para Python                  
│   ├── .env                       # Configuracion de las varaibles de entorno backend
│   ├── .env.example               # Preset de configuraciones de variables de entorno para GitHub
│   ├── requirements.txt           # Lista de librerías para el entorno de Python
│   ├── main.py                    # Archivo principal del codigo de backend. Punto de entrada de FastAPI
│   ├── app/
│   │   ├── api/                   # Endpoints HTTP y WebSockets
│   │   │   ├── v1/
│   │   │   │   ├── nodes.py       # API para obtener catálogo de nodos disponibles
│   │   │   │   ├── pipelines.py   # Guardar/cargar/ejecutar grafos de React Flow
│   │   │   │   └── ws_stream.py   # WebSocket para datos en tiempo real y progreso
│   │   ├── core/                  # Configuraciones globales y seguridad
│   │   │   └── config.py
│   │   ├── engine/                # Motor de ejecución del Grafo (DAG Executor)
│   │   │   └── buffer.py          # Guarda 
│   │   ├── modules/               # PROYECTOS / NODOS DE ANÁLISIS (Extensible)
│   │   │   ├── time_series/       # Filtros, análisis espectral, Fourier, Wavelets
│   │   │   ├── ml_models/         # Modelos de predicción, XGBoost, PyTorch, Scikit-Learn
│   │   │   ├── simulations/       # Monte Carlo, backtesting por eventos, vectorizado
│   │   │   ├── portfolio/         # CAPM, optimización convexa (cvxpy), Var/cVaR
│   │   │   ├── technical_analysis/# Indicadores TA-Lib / pandas-ta
│   │   │   └── statistical_tests/ # Test de Dickey-Fuller, co-integración, Hurst
│   │   └── brokers/               # Capa de Abstracción de Brokers
│   │       ├── base.py            # Interfaz genérica (Abstract Base Class)
│   │       ├── mt5_adapter.py     # Implementación MetaTrader 5
│   │       └── ibkr_adapter.py    # Implementación Interactive Brokers (no implementado)
│   ├── data/                      # Almacenamiento de los datos de broker en formato parquet/arrow
│   └── tests/                     # Tests unitarios y de validación estadística
└── frontend/                      # Aplicación React + TypeScript + React Flow
    ├── .env                       # Configuracion de las varaibles de entorno frontend
    ├── esling-config.js           # Reglas del linter (analizador de sintaxis)
    ├── index.html                 # Codigo base de HTML en el que se inyecta el codigo de React con Vite
    ├── package.json               # Archivo de configuración del frontend (librerías,scripts para arrancar servidor, nombre de proyecto,etc.)
    ├── package-lock.json          # Archivo de dependencias con bloqueo de versiones
    ├── tsconfig.app.json          # Config del compilador de TypeScript en la parte del cliente
    ├── tsconfig.json              # Config del compilador de TypeScript en JavaScript
    ├── tsconfig.node.json         # Config del compilador de scripts de TypeScript en Node.js
    ├── vite.config.ts             # Configurador del servidor interno de Vite (empaquetado, puertos, proxis de conexion API)
    ├── node_modules/              # Carpeta de librerías
    └── src/
        ├── assets/
        ├── components/
        │   ├── canvas/            # Lienzo principal de React Flow
        │   ├── nodes/             # Componentes UI personalizados para cada tipo de nodo
        │   ├── sidebar/           # Menú lateral para arrastrar nodos al lienzo
        │   ├── inspector/         # Panel lateral para ajustar parámetros del nodo seleccionado
        │   └── charts/            # Componentes de gráficos (TradingView, Plotly)
        ├── store/                 # Estado global de los pipelines (Zustand/Redux)
        ├── services/              # Cliente API REST y conexión WebSocket con Backend
        └── types/                 # Definiciones de TypeScript para nodos y flujos 
# Logica de nodos
Los nodos con diferentes colores de conexion significan diferentes cosas:
    -Conexiones azules: Datos que vienen solos por pulso
    -Conexiones moradas: Datos que vienen agregados por pulso como varios datos sueltos
    -Conexiones verdes: conectores universales que aceptan datos solos o agregados.
    -Conexiones amarillas: Conexiones multiplexadas
        -Si tiene un circulo negro es especificamente int/out de consola

# TODO List
    -[HECHO] El buffer sigue recibiendo datos de un nodo que ya ha sido desconectado 
    -[HECHO] Cuando se elimina una tabla o unas entradas con consola no se ve reflejado en el buffer
    -[HECHO] Los nodos del buffer o de la consola estan al reves (y los de la consola estan del color equivocado)
    -[HECHO]Los datos de pandas colapsan porque los objetos no son serializables bajo JSON
    -[HECHO]Respuesta del output desconectada del sistema de edges
    -[HECHO] La consola envía instrucciones cuando se cambia de modo despues de la primera instrucción
    
    -Hacer nodos auxiliares: Multiplexor, Decodificador, Clock
    -Hacer preprocesador de datos 
    -Implementar otras APIS de Retrieving de datos y mirar si lee los timeframes
