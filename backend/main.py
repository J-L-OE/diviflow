import os
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from parser import parse_trade_republic_pdf

# --- KONFIGURATION ---
# (Lass deine Keys hier so stehen, wie sie waren!)
SUPABASE_URL = "https://uzjtyleslxqofmvrpque.supabase.co"
SUPABASE_KEY = "sb_publishable_hhTK3fDX0nflMMSOwwxI9w_8-a4uqm2"

# Verbindung zur Datenbank
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def convert_date_for_db(date_str):
    """Wandelt '15.12.2025' in '2025-12-15' um"""
    try:
        dt = datetime.strptime(date_str, "%d.%m.%Y")
        return dt.strftime("%Y-%m-%d")
    except:
        return None

# --- ENDPUNKTE ---

@app.get("/")
def read_root():
    return {"status": "DiviFlow Backend läuft"}

@app.get("/api/dividends")
def get_dividends():
    try:
        # Hol alle Dividenden, sortiert nach Datum (neueste zuerst)
        response = supabase.table("dividends").select("*").order("pay_date", desc=True).execute()
        return {"status": "success", "data": response.data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Nur PDF-Dateien erlaubt.")
    
    content = await file.read()
    
    try:
        # 1. Parsen
        data = parse_trade_republic_pdf(content)
        
        # Sicherheits-Check
        if data["amount"] == 0 or data["isin"] == "Nicht gefunden":
             return {"status": "error", "message": "Konnte keine Daten im PDF finden."}

        # 2. Datum konvertieren
        db_date = convert_date_for_db(data["date"])
        if not db_date:
            return {"status": "error", "message": f"Ungültiges Datumsformat: {data['date']}"}

        db_record = {
            "isin": data["isin"],
            "name": data["name"],   # <--- WICHTIG: Diese Zeile muss da stehen!
            "amount": data["amount"],
            "pay_date": db_date,
            "broker": "Trade Republic",
            "currency": "EUR"
        }
        
        # 3. Versuch zu speichern (Mit Duplikat-Schutz)
        try:
            supabase.table("dividends").insert(db_record).execute()
            return {"status": "success", "data": data, "message": "Neu gespeichert!"}
        
        except Exception as db_error:
            # Hier fangen wir den Fehler ab!
            error_str = str(db_error)
            # Wir prüfen auf den Fehlercode 23505 (Unique Violation) oder Text
            if "23505" in error_str or "duplicate key" in error_str or "unique constraint" in error_str:
                print(f"Duplikat erkannt: {data['isin']}") # Info im Terminal
                return {"status": "skipped", "data": data, "message": "Bereits vorhanden."}
            else:
                # Wenn es ein anderer Fehler ist (z.B. Datenbank down), werfen wir ihn weiter
                raise db_error

    except Exception as e:
        print(f"Kritischer Fehler: {e}")
        return {"status": "error", "message": str(e)}