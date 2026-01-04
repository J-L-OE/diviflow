'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [dividends, setDividends] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  
  // Supabase & Router initialisieren
  const supabase = createClient()
  const router = useRouter()

  // Dividenden laden
  const fetchDividends = async () => {
    const { data } = await supabase
      .from('dividends')
      .select('*')
      .order('pay_date', { ascending: true })

    if (data) setDividends(data)
  }

  // User checken beim Start
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) fetchDividends()
    }
    getUser()
  }, [])

  // Logout Funktion
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.refresh() 
  }

  // Löschen Funktion
  const handleDelete = async (id: string) => {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return

    try {
      const { error } = await supabase.from('dividends').delete().eq('id', id)
      if (error) throw error
      setMessage("🗑️ Eintrag gelöscht.")
      setTimeout(() => setMessage(null), 3000)
      fetchDividends()
    } catch (error: any) {
      alert('Fehler beim Löschen: ' + error.message)
    }
  }

  // Datei Upload Funktion
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage(null)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      const result = await response.json()
      
      if (result.message && result.message.includes('⚠️')) {
         setMessage(result.message)
         setTimeout(() => setMessage(null), 5000)
      } else if (!response.ok) {
        throw new Error(result.error)
      } else {
        fetchDividends()
        setMessage("✅ " + result.message)
        setTimeout(() => setMessage(null), 5000)
      }

    } catch (error: any) {
      alert('Fehler: ' + error.message)
    } finally {
      setUploading(false)
      // Input zurücksetzen trick: Wir leeren einfach den Wert des Events, falls möglich
      e.target.value = ''
    }
  }

  // Berechnungen für UI
  const totalAmount = dividends.reduce((sum, item) => sum + (item.amount || 0), 0)

  const chartData = dividends.map(item => ({
    ...item,
    shortDate: new Date(item.pay_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
    fullDate: new Date(item.pay_date).toLocaleDateString('de-DE')
  }))

  const sortedList = [...dividends].sort((a, b) => new Date(b.pay_date).getTime() - new Date(a.pay_date).getTime())

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-600">DiviFlow</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 hidden sm:block">{user ? `Moin, ${user.email}` : '...'}</span>
              <button onClick={handleLogout} className="bg-gray-100 px-3 py-2 rounded text-sm hover:bg-gray-200">Abmelden</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl py-10 px-4">
        
        {/* KPI Bereich */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-8">
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm font-medium uppercase">Gesamt Netto</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{totalAmount.toFixed(2)} €</p>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm font-medium uppercase">Anzahl Zahlungen</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{dividends.length}</p>
          </div>
          
          {/* DER NEUE UPLOAD BUTTON (Mobile Safe) */}
          <label className="flex items-center justify-center rounded-xl bg-blue-50 p-6 border-2 border-dashed border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer relative">
             <input 
                type="file" 
                onChange={handleFileChange} 
                className="hidden" 
                accept="application/pdf, image/*" 
             />
             <div className="flex flex-col items-center text-blue-600">
                <span className="text-2xl mb-1">{uploading ? '⏳' : '📄'}</span>
                <span className="font-medium">{uploading ? 'Verarbeite...' : 'PDF/Bild Hochladen'}</span>
             </div>
          </label>
        </div>

        {/* Diagramm */}
        {dividends.length > 0 && (
          <div className="mb-8 rounded-xl bg-white p-6 shadow-sm border border-gray-100 h-80">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Verlauf</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis 
                  dataKey="shortDate" 
                  stroke="#9CA3AF" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#9CA3AF" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `${value}€`} 
                />
                <Tooltip 
                  cursor={{fill: '#F3F4F6'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`${Number(value).toFixed(2)} €`, 'Betrag']}
                  labelFormatter={(label) => `Datum: ${label}`}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="#3B82F6" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Status Meldung */}
        {message && (
          <div className={`mb-6 p-4 rounded-md border animate-pulse ${message.includes('🗑️') ? 'bg-red-50 text-red-700 border-red-200' : message.includes('⚠️') ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
            {message}
          </div>
        )}

        {/* Die Liste */}
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-medium text-gray-900">Zahlungshistorie</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {sortedList.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Noch keine Daten.</p>
            ) : (
              sortedList.map((item) => (
                <div key={item.id} className="px-6 py-4 flex justify-between items-center hover:bg-gray-50 transition group">
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-500">{item.isin} • {new Date(item.pay_date).toLocaleDateString('de-DE')}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm">
                      +{item.amount?.toFixed(2)} €
                    </span>
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="text-gray-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      title="Löschen"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}