import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 1. Supabase Client erstellen (Der Türsteher holt sich seine Liste)
  const supabase = createServerClient(
    'https://uzjtyleslxqofmvrpque.supabase.co', // <--- URL hier rein
    'sb_publishable_hhTK3fDX0nflMMSOwwxI9w_8-a4uqm2',     // <--- Langer Key hier rein
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 2. Prüfen: Wer ist da?
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 3. Die Regeln des Türstehers
  
  // Wenn KEIN User da ist ... UND wir sind NICHT auf der Login-Seite ...
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    // ... dann schmeiß ihn zur Login-Seite zurück!
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Wenn ein User da ist ... UND er will zur Login-Seite ...
  if (user && request.nextUrl.pathname.startsWith('/login')) {
    // ... dann schick ihn direkt zum Dashboard (er ist ja schon drin)
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Wende den Türsteher auf alles an, AUSSER:
     * - Bilder, Grafiken, Icons
     * - Interne Next.js Dateien (_next)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}