import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    'https://uzjtyleslxqofmvrpque.supabase.co',
    'sb_publishable_hhTK3fDX0nflMMSOwwxI9w_8-a4uqm2'
  )
}