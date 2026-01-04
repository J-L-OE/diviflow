import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import PDFParser from 'pdf2json'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // 1. Check Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
  }

  try {
    // --- ÄNDERUNG: Wir lesen jetzt JSON statt FormData ---
    const body = await request.json()
    const { fileData, fileName } = body

    if (!fileData) {
      return NextResponse.json({ error: 'Keine Datei empfangen' }, { status: 400 })
    }

    // Die Datei kommt als "data:application/pdf;base64,JVBERi0xLjQK..."
    // Wir müssen den vorderen Teil abschneiden, um den reinen Inhalt zu bekommen
    const base64Content = fileData.split(';base64,').pop()
    const buffer = Buffer.from(base64Content, 'base64')

    // --- Ab hier ist alles wie vorher (PDF Parsing) ---
    
    // PDF Parsing
    const parser = new PDFParser(null, true)

    const pdfText = await new Promise<string>((resolve, reject) => {
      parser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError))
      parser.on("pdfParser_dataReady", () => resolve(parser.getRawTextContent()))
      
      // Den Buffer direkt parsen
      parser.parseBuffer(buffer)
    })

    // Regex Suche (wie vorher)
    const amountMatch = pdfText.match(/Betrag\s*([\d,.]+)\s*EUR/i) || 
                        pdfText.match(/Nettobetrag\s*([\d,.]+)\s*EUR/i) ||
                        pdfText.match(/Ausmachung\s*([\d,.]+)\s*EUR/i) ||
                        pdfText.match(/Endbetrag\s*([\d,.]+)\s*EUR/i)

    const dateMatch = pdfText.match(/Valuta\s*(\d{2}\.\d{2}\.\d{4})/) ||
                      pdfText.match(/Datum\s*(\d{2}\.\d{2}\.\d{4})/)

    const isinMatch = pdfText.match(/([A-Z]{2}[A-Z0-9]{9}\d)/)

    if (!amountMatch) {
        return NextResponse.json({ error: 'Konnte keinen Betrag im PDF finden.' }, { status: 400 })
    }

    // Werte extrahieren
    const rawAmount = amountMatch[1].replace('.', '').replace(',', '.')
    const amount = parseFloat(rawAmount)
    
    const rawDate = dateMatch ? dateMatch[1] : new Date().toLocaleDateString('de-DE')
    // Datum umwandeln von DD.MM.YYYY zu YYYY-MM-DD
    const [day, month, year] = rawDate.split('.')
    const isoDate = `${year}-${month}-${day}`

    const isin = isinMatch ? isinMatch[1] : 'Unbekannt'
    
    // Name raten (Optional)
    let name = 'Dividende'
    if (pdfText.includes('Apple')) name = 'Apple Inc.'
    if (pdfText.includes('Microsoft')) name = 'Microsoft Corp.'
    if (pdfText.includes('Realty Income')) name = 'Realty Income'

    // Check auf Duplikate
    const { data: existing } = await supabase
        .from('dividends')
        .select('id')
        .eq('user_id', user.id)
        .eq('amount', amount)
        .eq('pay_date', isoDate)
        .single()

    if (existing) {
        return NextResponse.json({ message: `⚠️ Diese Dividende (${amount} €) existiert schon!` })
    }

    // In Datenbank speichern
    const { error: insertError } = await supabase
        .from('dividends')
        .insert({
            user_id: user.id,
            amount: amount,
            pay_date: isoDate,
            isin: isin,
            name: name
        })

    if (insertError) throw insertError

    return NextResponse.json({ 
        message: `Erfolg! ${amount.toFixed(2)} € (vom ${rawDate}) gespeichert.` 
    })

  } catch (error: any) {
    console.error('Upload Error:', error)
    return NextResponse.json({ error: 'Server Fehler: ' + error.message }, { status: 500 })
  }
}