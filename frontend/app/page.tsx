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

  // User Session prüfen
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) fetchDividends()
    }
    getUser()
  }, [])

  // Logout
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.refresh() 
  }

  // Löschen
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

  // --- NEU: Hilfsfunktion für Base64 Umwandlung ---
  const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = error => reject(error)
    })
  }

  // --- NEU: Upload Funktion (Mobile Safe via JSON) ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage(null)

    try {
      // 1. Datei in Text umwandeln (Base64)
      const base64File = await fileToBase64(file)

      // 2. Als JSON senden (statt FormData) - das ist stabiler auf iOS
      const response = await fetch('/api/upload', { 
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          fileData: base64File,
          fileName: file.name
        }) 
      })

      const result = await response.json()
      
      if (result.message && result.message.includes('⚠️')) {
         setMessage(result.message)
         setTimeout(() => setMessage(null), 5000)
      } else if (!response.ok) {
        throw new Error(result.error || 'Upload fehlgeschlagen')
      } else {
        fetchDividends()
        setMessage("✅ " + result.message)
        setTimeout(() => setMessage(null), 5000)
      }

    } catch (error: any) {
      console.error(error)
      alert('Fehler: ' + error.message)
    } finally {
      setUploading(false)
      e.target.value = '' // Reset
    }
  }

  // UI Berechnungen
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
          
          {/* --- STABILER MOBILE UPLOAD --- */}
          {/* 1. Der versteckte Input */}
          <input 
            id="file-upload" 
            type="file" 
            onChange={handleFileChange} 
            className="hidden" 
            accept="application/pdf, image/*" 
          />

          {/* 2. Das sichtbare Label */}
          <label 
            htmlFor="file-upload" 
            className={`flex items-center justify-center rounded-xl p-6 border-2 border-dashed transition-colors cursor-pointer relative ${
              uploading ? 'bg-gray-50 border-gray-300' : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
            }`}
          >
             <div className="flex flex-col items-center text-blue-600">
                <span className="text-2xl mb-1">{uploading ? '⏳' : '📄'}</span>
                <span className="font-medium">{uploading ? 'Verarbeite...' : 'PDF Hochladen'}</span>
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
                  contentStyle={{ borderRadius