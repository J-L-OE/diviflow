import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
// @ts-ignore
import PDFParser from 'pdf2json'

export async function POST(request: Request) {
  const cookieStore = await cookies()

  // --- SO IST ES RICHTIG FÜR DEN UPLOAD ---
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { } },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht eingeloggt!' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'Keine Datei' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // PDF Parsing
    const parser = new PDFParser(null, true)
    const pdfText = await new Promise<string>((resolve, reject) => {
      parser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError))
      parser.on("pdfParser_dataReady", () => resolve(parser.getRawTextContent()))
      parser.parseBuffer(buffer)
    })

    // --- DIE LOGIK FÜR TRADE REPUBLIC ---
    
    // 1. ISIN finden (Muster: 2 Buchstaben, 9 Alphanumerisch, 1 Ziffer)
    const isinMatch = pdfText.match(/\b([A-Z]{2}[A-Z0-9]{9}\d)\b/)
    const isin = isinMatch ? isinMatch[0] : "UNBEKANNT"

    // 2. Name finden (Trick: Name steht meist in der Zeile VOR der ISIN)
    let name = "Unbekannte Aktie"
    if (isin !== "UNBEKANNT") {
      const lines = pdfText.split(/\r\n|\n/) // Text in Zeilen zerhacken
      const isinIndex = lines.findIndex(line => line.includes(isin))
      if (isinIndex > 0) {
        // Nimm die Zeile davor und säubere sie
        name = lines[isinIndex - 1].trim()
        // Falls da "Stücke" oder so steht, nimm noch eine davor (Sicherheitsnetz)
        if (name.includes("Stücke") || name.length < 2) {
             name = lines[isinIndex - 2].trim()
        }
      }
    }

    // 3. Datum finden (Suche nach "DATUM DER ZAHLUNG", sonst nur "DATUM")
    // Trade Republic Format: DD.MM.YYYY
    const dateMatch = pdfText.match(/DATUM\s*(?:DER ZAHLUNG)?\s*(\d{2}\.\d{2}\.\d{4})/)
    let payDate = new Date().toISOString() // Fallback: Heute
    if (dateMatch) {
      // Wir müssen das deutsche Datum (11.12.2025) in Computer-Datum umwandeln (2025-12-11)
      const [day, month, year] = dateMatch[1].split('.')
      payDate = new Date(`${year}-${month}-${day}`).toISOString()
    }

    // 4. Betrag finden
    // Wir suchen nach "GESAMT" gefolgt von einer Zahl und "EUR"
    // Wir nehmen das LETZTE Vorkommen, weil das oft der Endbetrag ist.
    const amountMatches = [...pdfText.matchAll(/GESAMT\s+([\d\.]+)\s+EUR/g)]
    let amount = 0.00
    
    if (amountMatches.length > 0) {
      // Nimm den letzten Treffer
      const lastMatch = amountMatches[amountMatches.length - 1]
      amount = parseFloat(lastMatch[1])
    } else {
        // Fallback: Manchmal steht es anders da, wir suchen irgendeinen EUR Betrag am Ende
        const anyEurMatch = [...pdfText.matchAll(/([\d\.]+)\s+EUR/g)]
        if (anyEurMatch.length > 0) {
            amount = parseFloat(anyEurMatch[anyEurMatch.length - 1][1])
        }
    }

    console.log(`Gefunden: ${name} | ${amount} € | ${isin} | ${payDate}`)

    // 5. Speichern
    const { error: dbError } = await supabase
      .from('dividends')
      .insert({
        name: name,
        amount: amount,
        isin: isin,
        pay_date: payDate,
        user_id: user.id 
      })

    if (dbError) {
      // Spezial-Behandlung: Wenn es ein Duplikat ist (Fehlercode 23505)
      if (dbError.code === '23505') {
        // Wir schicken eine nette Info an das Frontend zurück
        return NextResponse.json({ message: `⚠️ ${name} vom ${new Date(payDate).toLocaleDateString()} existiert schon!` })
      }
      // Andere Fehler werfen wir wie gewohnt
      throw new Error(dbError.message)
    }

    return NextResponse.json({ message: `Erfolg! ${name} (${amount} €) gespeichert.` })

  } catch (error: any) {
    console.error("Fehler:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}