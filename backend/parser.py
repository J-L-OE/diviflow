import pdfplumber
import re
import io

def smart_float(amount_str):
    if ',' in amount_str:
        clean = amount_str.replace('.', '').replace(',', '.')
        return float(clean)
    else:
        return float(amount_str)

def parse_trade_republic_pdf(file_bytes):
    text = ""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text += page.extract_text() or ""

    # 1. ISIN finden
    isin_match = re.search(r'([A-Z]{2}[A-Z0-9]{9}[0-9])', text)
    isin = isin_match.group(1) if isin_match else "Nicht gefunden"

    # 2. Namen finden
    company_name = isin # Fallback
    
    if isin != "Nicht gefunden":
        lines = text.split('\n')
        for i, line in enumerate(lines):
            if isin in line:
                print(f"DEBUG: ISIN gefunden in Zeile {i}")
                
                # Wir schauen uns bis zu 5 Zeilen darüber an
                start_search = max(0, i - 5)
                candidates = lines[start_search:i]
                
                # Rückwärts suchen
                for candidate in reversed(candidates):
                    clean_line = candidate.strip()
                    
                    # A. Filter: Zeilen überspringen, die wir sicher nicht wollen
                    if ("Ex-Datum" in clean_line or 
                        "POSITION" in clean_line or 
                        "Stücke" in clean_line or 
                        "Nominale" in clean_line or
                        clean_line == ""):
                        continue

                    # B. Bereinigung: Wir schneiden "Zahl + Währung" am Ende weg
                    # Beispiel: "Microsoft 1.41 USD" -> "Microsoft"
                    # Regex erklärt: Suche nach Leerzeichen + Zahl + (optional Komma/Punkt Zahl) + Währung am Ende ($)
                    cleaned_name = re.sub(r'\s+\d+[\.,]?\d*\s*[A-Z]{3}$', '', clean_line).strip()
                    
                    # C. Check: Ist noch was übrig, das wie ein Name aussieht?
                    if len(cleaned_name) > 1 and not re.match(r'^[\d.,]+$', cleaned_name):
                         company_name = cleaned_name
                         print(f"DEBUG: Name erkannt (Bereinigt): '{company_name}'")
                         break
                break

    # 3. Datum finden
    date_match = re.search(r'(\d{2}\.\d{2}\.\d{4})', text)
    date = date_match.group(1) if date_match else "Nicht gefunden"

    # 4. Betrag finden
    amount = 0.0
    matches = re.findall(r'GESAMT\s+([\d.,]+)\s*EUR', text)
    
    if matches:
        raw_amount = matches[-1]
        amount = smart_float(raw_amount)

    return {
        "broker": "Trade Republic",
        "isin": isin,
        "name": company_name,
        "date": date,
        "amount": amount,
        "currency": "EUR"
    }