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
    const body = await request.json()
    const { fileData, fileName } = body

    if (!fileData) {
      return NextResponse.json({ error: 'Keine Datei empfangen' }, { status: 400 })
    }

    const base64Content = fileData.split(';base64,').pop()
    const buffer = Buffer.from(base64Content, 'base64')

    // PDF Parsing
    const parser = new PDFParser(null, true)

    const pdfText = await new Promise<string>((resolve, reject) => {
      parser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError))
      parser.on("pdfParser_dataReady", () => resolve(parser.getRawTextContent()))
      parser.parseBuffer(buffer)
    })

    // --- DEBUGGING: Zeig uns, was du liest! ---
    console.log('--- START PDF TEXT ---')
    console.log(pdfText)
    console.log('--- ENDE PDF TEXT ---')

    // Erweiterte Suche (Jetzt auch Gutschrift, Summe, etc.)
    const amountMatch = pdfText.match(/Betrag\s*([\d,.]+)\s*EUR/i) || 
                        pdfText.match(/Nettobetrag\s*([\d,.]+)\s*EUR/i) ||
                        pdfText.match(/Ausmachung\s*([\d,.]+)\s*EUR/i) ||
                        pdfText.match(/Endbetrag\s*([\d,.]+)\s*EUR/i) ||
                        pdfText.match(/Gutschrift\s*([\d,.]+)\s*EUR/i) || 
                        pdfText.match(/Auszahlung\s*([\d,.]+)\s*EUR/i) ||
                        pdfText.match(/Summe\s*([\d,.]+)\s*EUR/i)

    // Datumssuche (Jetzt auch Valuta, Zahltag)
    const dateMatch = pdfText.match(/Valuta\s*(\d{2}\.\d{2}\.\d{4})/) ||
                      pdfText.match(/Datum\s*(\d{2}\.\d{2}\.\d{4})/) ||
                      pdfText.match(/Zahltag\s*(\d{2}\.\d{2}\.\d{4})/) ||
                      pdfText.match(/(\d{2}\.\d{2}\.\d{4})/) // Fallback: Erstes Datum finden

    const isinMatch = pdfText.match(/([A-Z]{2}[A-Z0-9]{9}\d)/)

    if (!amountMatch) {
        // Wir geben den Fehler zurück, aber loggen ihn vorher
        console.log("FEHLER: Kein Betrag gefunden!")
        return NextResponse.json({ error: 'Konnte keinen Betrag im PDF finden. Check die Logs!' }, { status: 400 })
    }

    // Werte extrahieren und bereinigen
    // Entferne Tausenderpunkte (1.000,00 -> 1000,00) und mache Komma zu Punkt
    let rawAmount = amountMatch[1]
    if (rawAmount.includes('.') && rawAmount.includes(',')) {
        rawAmount = rawAmount.replace('.', '') // Tausender weg
    }
    rawAmount = rawAmount.replace(',', '.') // Komma zu Punkt
    
    const amount = parseFloat(rawAmount)
    
    const rawDate = dateMatch ? dateMatch[1] : new Date().toLocaleDateString('de-DE')
    const [day, month, year] = rawDate.split('.')
    const isoDate = `${year}-${month}-${day}`

    const isin = isinMatch ? isinMatch[1] : 'Unbekannt'
    
    let name = 'Dividende'
    if (pdfText.includes('Apple')) name = 'Apple Inc.'
    if (pdfText.includes('Microsoft')) name = 'Microsoft Corp.'
    if (pdfText.includes('Coca-Cola')) name = 'Coca-Cola'
    // Hier kannst du später mehr Namen ergänzen

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