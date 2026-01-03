"use client";
import { useState, useEffect } from "react";
import { Upload, CheckCircle, AlertCircle, FileText, DollarSign, Calendar, History, TrendingUp, Info, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [uploadData, setUploadData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("https://diviflow-backend.onrender.com/api/dividends");
      const json = await res.json();
      if (json.status === "success") {
        setHistory(json.data);
      }
    } catch (err) {
      console.error("Konnte Historie nicht laden", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    setLoading(true);
    setError("");
    setUploadData(null);

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:8000/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      
      if (result.status === "success") {
        setUploadData({ ...result.data, status: "new" });
        fetchHistory();
      } else if (result.status === "skipped") {
        setUploadData({ ...result.data, status: "skipped" });
      } else {
        setError(result.message || "Fehler beim Lesen.");
      }
    } catch (err) {
      setError("Server nicht erreichbar.");
    } finally {
      setLoading(false);
    }
  };

  // --- CHART LOGIK ---
  const chartData = history.reduce((acc: any[], curr) => {
    const date = new Date(curr.pay_date);
    const monthKey = date.toLocaleString('de-DE', { month: 'short', year: '2-digit' });
    
    const existing = acc.find(item => item.name === monthKey);
    
    if (existing) {
      existing.value += curr.amount;
    } else {
      acc.push({ 
        name: monthKey, 
        value: curr.amount, 
        timestamp: date.getTime() 
      }); 
    }
    return acc;
  }, [])
  .sort((a, b) => a.timestamp - b.timestamp);

  const totalDividends = history.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-8">
      <div className="max-w-4xl mx-auto">
        
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-blue-600 tracking-tight">DiviFlow</h1>
          <p className="text-slate-500 mt-2">Dein Cashflow Dashboard</p>
        </header>

        {/* --- KPI CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                <div className="flex items-center gap-3 text-slate-500 mb-2">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase tracking-wider">Gesamt Netto</span>
                </div>
                <div className="text-3xl font-extrabold text-slate-900">{totalDividends.toFixed(2)} €</div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                 <div className="flex items-center gap-3 text-slate-500 mb-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-bold uppercase tracking-wider">Zahlungen</span>
                </div>
                <div className="text-3xl font-extrabold text-slate-900">{history.length}</div>
            </div>

             <label className="bg-blue-600 hover:bg-blue-700 transition-colors p-6 rounded-2xl shadow-lg shadow-blue-200 cursor-pointer text-white flex flex-col items-center justify-center gap-2 group relative overflow-hidden">
                <input 
                    type="file" 
                    accept=".pdf" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                    disabled={loading}
                />
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <Upload className="w-8 h-8 group-hover:scale-110 transition-transform" />
                <span className="font-bold">{loading ? "Analysiere..." : "PDF Hochladen"}</span>
             </label>
        </div>

        {/* --- CHART SECTION --- */}
        {chartData.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    <h3 className="font-bold text-slate-700">Monatlicher Cashflow</h3>
                </div>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                                dataKey="name" 
                                tick={{fill: '#64748b', fontSize: 12}} 
                                axisLine={false} 
                                tickLine={false} 
                            />
                            <YAxis 
                                tick={{fill: '#64748b', fontSize: 12}} 
                                axisLine={false} 
                                tickLine={false}
                                tickFormatter={(value) => `${value}€`}
                            />
                            <Tooltip 
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                cursor={{fill: '#f1f5f9'}}
                            />
                            <Bar 
                                dataKey="value" 
                                fill="#3b82f6" 
                                radius={[4, 4, 0, 0]} 
                                barSize={40}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}

        {/* --- STATUS MESSAGES --- */}
        {error && (
            <div className="mb-8 p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
        )}

        {uploadData && (
            <div className={`mb-8 px-4 py-3 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 border ${
              uploadData.status === "skipped" 
                ? "bg-blue-50 border-blue-200 text-blue-800" 
                : "bg-green-50 border-green-200 text-green-800"
            }`}>
              {uploadData.status === "skipped" ? <Info className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
              <span>
                {uploadData.status === "skipped" ? "Bereits erfasst: " : "Erfolgreich gespeichert: "}
                {/* HIER AUCH UPDATE: Name anzeigen in der Success Message */}
                <strong>{uploadData.amount.toFixed(2)} €</strong> von {uploadData.name || uploadData.isin}
              </span>
            </div>
        )}

        {/* --- HISTORIE LISTE --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                <History className="w-5 h-5 text-slate-500" />
                <h2 className="font-semibold text-slate-700">Deine Zahlungen</h2>
            </div>
            
            {history.length === 0 ? (
                <div className="p-8 text-center text-slate-400">Lade deine erste Abrechnung hoch, um zu starten!</div>
            ) : (
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                        <tr>
                            <th className="px-6 py-3">Datum</th>
                            <th className="px-6 py-3">Asset</th>
                            <th className="px-6 py-3 text-right">Betrag</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {history.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 text-slate-500 text-sm font-mono">
                                    {new Date(item.pay_date).toLocaleDateString('de-DE')}
                                </td>
                                
                                {/* HIER IST DER FIX FÜR DEN NAMEN: */}
                                <td className="px-6 py-4 font-medium text-slate-800">
                                    {/* Zeige Name wenn da, sonst ISIN */}
                                    <div className="text-base font-bold text-slate-800">
                                        {item.name || item.isin}
                                    </div>
                                    {/* ISIN klein darunter */}
                                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                                        {item.isin} • {item.broker}
                                    </div>
                                </td>

                                <td className="px-6 py-4 text-right font-bold text-green-600">
                                    +{item.amount.toFixed(2)} €
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>

      </div>
    </div>
  );
}