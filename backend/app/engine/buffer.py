import os
import sqlite3
import polars as pl

class BufferManager:
    def __init__(self):
        # Memoria caliente (Polars)
        self.polars_tables = {}
        
        # Preparar el directorio persistente para SQL
        self.data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
        os.makedirs(self.data_dir, exist_ok=True)
        self.db_path = os.path.join(self.data_dir, "buffer.db")
    def execute_console(self, mode: str, code: str):
        # Función recursiva para sanitizar diccionarios y DataFrames anidados
        def _serialize_polars(obj):
            import polars as pl
            if isinstance(obj, pl.DataFrame):
                return obj.to_dicts()
            elif isinstance(obj, pl.Series):
                return obj.to_list()
            elif isinstance(obj, dict):
                return {str(k): _serialize_polars(v) for k, v in obj.items()}
            elif isinstance(obj, list) or isinstance(obj, tuple):
                return [_serialize_polars(v) for v in obj]
            return obj

        if mode == "SQL":
            try:
                with sqlite3.connect(self.db_path) as conn:
                    cursor = conn.cursor()
                    cursor.execute(code)
                    if code.strip().upper().startswith("SELECT"):
                        rows = cursor.fetchall()
                        col_names = [desc[0] for desc in cursor.description]
                        return [dict(zip(col_names, row)) for row in rows]
                    else:
                        conn.commit()
                        return [{"status": "Éxito", "rows_affected": cursor.rowcount, "mutated": True}]
            except Exception as e:
                return {"error": str(e)}
                
        elif mode == "PYTHON":
            import io
            import sys
            import traceback
            import polars as pl
            
            old_stdout = sys.stdout
            redirected_output = sys.stdout = io.StringIO()
            
            try:
                local_env = { "pl": pl, "tables": self.polars_tables, "result": None }
                exec(code, {}, local_env)
                sys.stdout = old_stdout
                
                out_str = redirected_output.getvalue()
                res = local_env.get("result")
                
                if res is not None:
                    return _serialize_polars(res)
                    
                return [{"output": out_str or "Ejecución completada sin output."}]
            except Exception as e:
                sys.stdout = old_stdout
                return {"error": traceback.format_exc()}
    def _init_sql_table(self, table_id: str, data_keys: list):
        safe_table_id = "".join(c for c in table_id if c.isalnum() or c == "_")
        columns = []
        for k in data_keys:
            # NUEVO: Forzamos que 'time' sea la Clave Primaria Única
            if k == "time":
                columns.append("time TEXT PRIMARY KEY")
            else:
                columns.append(f"{k} REAL")
                
        columns_sql = ", ".join(columns)
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f"CREATE TABLE IF NOT EXISTS {safe_table_id} ({columns_sql})")
            conn.commit()
        return safe_table_id
    def append_batch(self, table_id: str, data_list: list, mode: str) -> list:
        """Inserta un volumen masivo de datos de forma optimizada."""
        if not data_list:
            return []
            
        if mode == "SQL":
            safe_table_id = self._init_sql_table(table_id, list(data_list[0].keys()))
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                placeholders = ", ".join(["?"] * len(data_list[0]))
                columns = ", ".join(data_list[0].keys())
                
                # Transformamos la lista de dicts en lista de tuplas para executemany
                values_list = [tuple(d.values()) for d in data_list]
                
                # INSERT OR REPLACE evita duplicados si se carga el mismo histórico dos veces
                cursor.executemany(
                    f"INSERT OR REPLACE INTO {safe_table_id} ({columns}) VALUES ({placeholders})", 
                    values_list
                )
                conn.commit()
                
                # Para evitar reventar la memoria en retornos masivos, devolvemos solo la confirmación 
                # (El frontend ya tiene el array histórico en memoria para graficarlo)
                return [{"batch_success": True, "count": len(values_list)}]
        else:
            # Modo Polars
            new_df = pl.DataFrame(data_list)
            if table_id not in self.polars_tables:
                self.polars_tables[table_id] = new_df
            else:
                self.polars_tables[table_id] = pl.concat([
                    self.polars_tables[table_id], new_df
                ]).unique(subset=["time"], keep="last").sort("time")
                
            return [{"batch_success": True, "count": len(self.polars_tables[table_id])}]
    def append_data(self, table_id: str, data: dict, mode: str) -> list:
        if mode == "SQL":
            safe_table_id = self._init_sql_table(table_id, list(data.keys()))
            
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                placeholders = ", ".join(["?"] * len(data))
                columns = ", ".join(data.keys())
                values = tuple(data.values())
                
                # NUEVO: INSERT OR REPLACE previene duplicados idénticos en el mismo milisegundo
                cursor.execute(f"INSERT OR REPLACE INTO {safe_table_id} ({columns}) VALUES ({placeholders})", values)
                conn.commit()
                
                # NUEVO: ORDER BY time ASC garantiza que el gráfico no sufra saltos temporales
                cursor.execute(f"SELECT * FROM {safe_table_id} ORDER BY time ASC")
                rows = cursor.fetchall()
                col_names = [description[0] for description in cursor.description]
                return [dict(zip(col_names, row)) for row in rows]

        else:
            new_df = pl.DataFrame([data])
            
            if table_id not in self.polars_tables:
                self.polars_tables[table_id] = new_df
            else:
                # NUEVO: En Polars, concatenamos, borramos duplicados por fecha y ordenamos cronológicamente
                self.polars_tables[table_id] = pl.concat([
                    self.polars_tables[table_id], new_df
                ]).unique(subset=["time"], keep="last").sort("time")
            
            return self.polars_tables[table_id].to_dicts()

    def load_table(self, table_id: str, mode: str) -> list:
        if mode == "SQL":
            safe_table_id = "".join(c for c in table_id if c.isalnum() or c == "_")
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (safe_table_id,))
                if not cursor.fetchone():
                    return []
                
                # NUEVO: ORDER BY time ASC al recuperar el historial
                cursor.execute(f"SELECT * FROM {safe_table_id} ORDER BY time ASC")
                rows = cursor.fetchall()
                if not rows:
                    return []
                
                col_names = [description[0] for description in cursor.description]
                return [dict(zip(col_names, row)) for row in rows]
        else:
            if table_id in self.polars_tables:
                # NUEVO: Aseguramos el orden al enviar a la UI
                return self.polars_tables[table_id].sort("time").to_dicts()
            return []
    def clear_table(self, table_id: str, mode: str):
        if mode == "LOCAL_MEM":
            # En memoria volátil, sí liberamos la RAM
            if table_id in self.polars_tables:
                del self.polars_tables[table_id]
        elif mode == "SQL":
            pass
