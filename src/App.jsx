import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { 
  Plus, Trash2, User, Settings, Camera, MessageSquare, ChevronRight, CheckCircle2, 
  XCircle, Utensils, Target, Search, Scale, Loader2, LineChart as ChartIcon, 
  TrendingUp, Calendar, X, Droplets, Minus, Flag, Trophy, AlertTriangle, Zap, Lightbulb, ChefHat
} from 'lucide-react';

// ==========================================
// 1. TA CONFIGURATION FIREBASE PERSONNELLE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyByTZ3o9-7f5r72JOB6eRKM7UclANNizlo",
  authDomain: "fitcoach-app-a4658.firebaseapp.com",
  projectId: "fitcoach-app-a4658",
  storageBucket: "fitcoach-app-a4658.firebasestorage.app",
  messagingSenderId: "868644520877",
  appId: "1:868644520877:web:3471bbe48472c5b5681724",
  measurementId: "G-XVZN90WQ7R"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "fitcoach-app-v1"; 

// ==========================================
// 2. TA CLÉ GEMINI (Google AI Studio)
// ==========================================
const GEMINI_API_KEY = "AIzaSyAYOPelfkrEJuj9RorIjKCY7AeuHbYy21k";

const FOOD_GUIDE = [
  { cat: "Boulangerie", ban: "Croissants, Pains au chocolat, Brioches, Pain blanc.", replace: "Pain complet, seigle." },
  { cat: "Petit-Déj", ban: "Céréales sucrées, Pain de mie.", replace: "Flocons d'avoine, œufs." },
  { cat: "Snacks", ban: "Kinder, Snickers, Oreos, Bonbons.", replace: "Amandes, Pomme, Choco noir 85%." },
  { cat: "Boissons", ban: "Sodas, Jus de fruits, Ice Tea.", replace: "Eau, Thé, Café noir." },
  { cat: "Sauces", ban: "Ketchup, Mayonnaise, Soja sucrée.", replace: "Moutarde, Citron, Épices." }
];

const SimpleLineChart = ({ data, color = "#4f46e5", height = 150, targetLine = null }) => {
  const chartData = data.length === 0 ? [] : (data.length === 1 ? [{label: 'Démarrage', value: 0}, ...data] : data);
  if (chartData.length < 2) return <div className="h-[150px] flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-[10px] text-slate-400 font-black uppercase italic text-center px-4">Ajoute des repas pour voir la courbe</div>;
  const values = chartData.map(d => d.value);
  if (targetLine !== null) values.push(targetLine);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 10);
  const range = max - min || 1;
  const width = 300;
  const points = chartData.map((d, i) => `${(i / (chartData.length - 1)) * width},${height - ((d.value - min) / range) * height}`).join(' ');
  const targetY = targetLine !== null ? height - ((targetLine - min) / range) * height : null;
  return (
    <div className="relative w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        {targetY !== null && <line x1="0" y1={targetY} x2={width} y2={targetY} stroke="#ef4444" strokeWidth="1" strokeDasharray="4 2" />}
        <polyline fill="none" stroke={color} strokeWidth="3" points={points} strokeLinecap="round" strokeLinejoin="round" />
        {chartData.map((d, i) => <circle key={i} cx={(i / (chartData.length - 1)) * width} cy={height - ((d.value - min) / range) * height} r="3" fill="white" stroke={color} strokeWidth="2" />)}
      </svg>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ 
    weight: 0, 
    height: 0, 
    age: 0,
    activityLevel: "Modéré",
    name: "Utilisateur", 
    targetWeight: 0, 
    initialWeight: 0, 
    maxCalories: 0 
  });
  const [dailyMeals, setDailyMeals] = useState({ Matin: [], Midi: [], Collation: [], Soir: [] });
  const [dailyWater, setDailyWater] = useState(0); 
  const [historyLogs, setHistoryLogs] = useState([]);
  const [weightHistory, setWeightHistory] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(null);
  const [analysePeriod, setAnalysePeriod] = useState('1J');
  const [geminiInsight, setGeminiInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        loadUserData(u.uid);
      } else {
        try {
          const result = await signInAnonymously(auth);
          setUser(result.user);
          loadUserData(result.user.uid);
        } catch (error) {
          console.error("Erreur Auth:", error.code);
          setAuthError("L'authentification a échoué. Activez le mode 'Anonyme' dans Firebase.");
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [currentDate]);

  const loadUserData = (uid) => {
    // Écoute du profil en TEMPS RÉEL pour éviter les pertes de données
    const unsubscribeProfile = onSnapshot(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'main'), (snap) => {
      if (snap.exists()) {
        setProfile(snap.data());
      }
      setLoading(false); // On n'enlève le chargement que quand le profil est là
    }, (err) => {
        console.error("Erreur Profil:", err);
        setLoading(false);
    });

    // Écoute des repas du jour
    onSnapshot(doc(db, 'artifacts', appId, 'users', uid, 'logs', currentDate), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setDailyMeals(data.meals || { Matin: [], Midi: [], Collation: [], Soir: [] });
        setDailyWater(data.water || 0);
      } else {
        setDailyMeals({ Matin: [], Midi: [], Collation: [], Soir: [] });
        setDailyWater(0);
      }
    });

    // Écoute de l'historique
    onSnapshot(collection(db, 'artifacts', appId, 'users', uid, 'logs'), (s) => {
      setHistoryLogs(s.docs.map(d => ({ date: d.id, ...d.data() })).sort((a,b) => a.date.localeCompare(b.date)));
    });

    // Écoute du poids
    onSnapshot(collection(db, 'artifacts', appId, 'users', uid, 'weightLogs'), (s) => {
      setWeightHistory(s.docs.map(d => ({ date: d.id, value: d.data().weight })).sort((a,b) => a.date.localeCompare(b.date)));
    });

    return () => unsubscribeProfile();
  };

  const getDailyTotal = (meals) => Object.values(meals).flat().reduce((acc, curr) => acc + (parseInt(curr.calories) || 0), 0);
  const totalCaloriesToday = getDailyTotal(dailyMeals);
  const calorieLimit = parseFloat(profile.maxCalories) || 0;
  const caloriePercent = calorieLimit > 0 ? (totalCaloriesToday / calorieLimit) * 100 : 0;

  const saveDayData = async (meals, water) => {
    if (!user) return;
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'logs', currentDate), { meals, water, date: currentDate }, { merge: true });
  };

  const addFoodItem = async (time, name, calories) => {
    const updated = { ...dailyMeals };
    updated[time] = [...(updated[time] || []), { id: Date.now(), name, calories: parseInt(calories) || 0 }];
    setDailyMeals(updated);
    if (user) await saveDayData(updated, dailyWater);
    setShowAddModal(null);
  };

  const removeFoodItem = async (time, id) => {
    const updated = { ...dailyMeals };
    updated[time] = updated[time].filter(item => item.id !== id);
    setDailyMeals(updated);
    if (user) await saveDayData(updated, dailyWater);
  };

  const updateWater = async (val) => {
    const newVal = Math.max(0, dailyWater + val);
    setDailyWater(newVal);
    if (user) await saveDayData(dailyMeals, newVal);
  };

  const weightProgress = useMemo(() => {
    const initial = parseFloat(profile.initialWeight) || 0;
    const current = parseFloat(profile.weight) || 0;
    const target = parseFloat(profile.targetWeight) || 0;
    if (initial === 0 || target === 0 || target >= initial) return { percent: 0, remaining: 0 };
    const lost = initial - current;
    const total = initial - target;
    return { percent: Math.round(Math.max(0, Math.min(100, (lost/total)*100))), remaining: Math.max(0, current - target).toFixed(1) };
  }, [profile]);

  const generateInsight = async () => {
    if (insightLoading || !GEMINI_API_KEY || totalCaloriesToday === 0) return;
    setInsightLoading(true);
    try {
      const foods = Object.entries(dailyMeals).map(([t, items]) => `${t}: ${items.map(i => i.name + "(" + i.calories + ")").join(', ')}`).join(' | ');
      const prompt = `Utilisateur: ${profile.weight}kg, ${profile.height}cm, ${profile.age}ans. Activité: ${profile.activityLevel}.
      Repas: ${foods}. Total: ${totalCaloriesToday}/${calorieLimit} kcal. 
      Donne un verdict pour le repas le plus riche (✅ VALIDÉ, ⚠️ ATTENTION ou ❌ STOP) et un conseil court. CONSIGNES: 3 lignes MAX. Gras obligatoire.`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      setGeminiInsight(data.candidates?.[0]?.content?.parts?.[0]?.text || "Analyse prête.");
    } catch (e) { setGeminiInsight("Erreur de connexion coach."); } finally { setInsightLoading(false); }
  };

  useEffect(() => { if (activeTab === 'analyse' && totalCaloriesToday > 0) generateInsight(); }, [activeTab]);

  const callGemini = async (prompt, imageBase64 = null, isLogging = false) => {
    if (!GEMINI_API_KEY) return "Configure ta clé API !";
    setGeminiLoading(true);
    try {
      const foodsEaten = Object.entries(dailyMeals).map(([t, items]) => `${t}: ${items.map(i => i.name).join(', ')}`).join(' | ');
      let systemPrompt = `Coach Expert Sèche. Profil: ${profile.weight}kg, ${profile.height}cm, ${profile.age}ans. Activité: ${profile.activityLevel}.
      Aujourd'hui: ${totalCaloriesToday}/${calorieLimit} kcal. Repas: ${foodsEaten}.
      Réponds en 4 lignes MAX. Direct. Utilise **gras**.`;

      let payload = { 
        contents: [{ role: "user", parts: [{ text: prompt || "Fais le point." }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      };
      if (imageBase64 && isLogging) {
        payload.contents[0].parts = [{ text: "Analyse nourriture. Retourne JSON: {\"name\": \"...\", \"calories\": 000}" }, { inlineData: { mimeType: "image/png", data: imageBase64 } }];
        payload.generationConfig = { responseMimeType: "application/json" };
      } else if (imageBase64) {
        payload.contents[0].parts = [{ text: "Analyse plat. Verdict: ✅ VALIDÉ, ⚠️ ATTENTION ou ❌ STOP. Bref." }, { inlineData: { mimeType: "image/png", data: imageBase64 } }];
      }
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (isLogging) return JSON.parse(text);
      return text;
    } catch (e) { return isLogging ? null : "Erreur Coach."; } finally { setGeminiLoading(false); }
  };

  const handleImageUpload = (e, targetTime = null) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(',')[1];
        if (targetTime) {
          const res = await callGemini("", base64, true);
          if (res) addFoodItem(targetTime, res.name, res.calories);
        } else {
          setChatHistory(p => [...p, { role: 'user', text: "[Analyse photo...]" }]);
          const res = await callGemini("", base64);
          setChatHistory(p => [...p, { role: 'model', text: res }]);
          setActiveTab('gemini');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50"><div className="text-center space-y-4"><Loader2 className="animate-spin text-indigo-600 mx-auto" size={40} /><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest animate-pulse">Récupération de tes données...</p></div></div>;

  if (authError) return (
    <div className="flex h-screen items-center justify-center bg-red-50 p-6 text-center">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-red-100 space-y-4">
        <AlertTriangle size={48} className="mx-auto text-red-500" />
        <h2 className="text-xl font-black text-red-600 uppercase tracking-tight">Erreur de Configuration</h2>
        <p className="text-sm font-bold text-slate-700 leading-relaxed">{authError}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-red-600 text-white rounded-xl font-black text-xs uppercase shadow-lg active:scale-95 transition-all">Réessayer</button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen transition-all duration-700 pb-28 font-sans ${caloriePercent >= 100 ? 'bg-red-50' : 'bg-slate-50'}`}>
      <header className={`border-b sticky top-0 z-30 p-4 flex justify-between items-center transition-colors duration-500 shadow-sm ${caloriePercent >= 100 ? 'bg-red-600 text-white border-red-500' : 'bg-white'}`}>
        <div><h1 className="text-xl font-black italic tracking-tighter leading-none">FITCOACH 2.0</h1><p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${caloriePercent >= 100 ? 'text-red-100' : 'text-slate-400'}`}>Discipline • Sèche</p></div>
        <button onClick={() => setActiveTab('profile')} className={`p-2 rounded-full ${caloriePercent >= 100 ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}><User size={20} /></button>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
            {/* PROGRESSION */}
            <div className="bg-white border-2 border-slate-100 rounded-3xl p-5 shadow-sm">
              <div className="flex justify-between items-center mb-3"><div className="flex items-center gap-2"><Trophy size={16} className="text-amber-500" /><h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Objectif {profile.targetWeight}kg</h3></div><span className="text-lg font-black text-indigo-600">{weightProgress.percent}%</span></div>
              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${weightProgress.percent}%` }}></div></div>
            </div>

            {/* CALORIES */}
            <div className={`rounded-3xl p-6 text-white shadow-xl transition-all duration-500 relative overflow-hidden ${caloriePercent >= 100 ? 'bg-red-600 animate-pulse' : caloriePercent >= 80 ? 'bg-amber-500' : 'bg-indigo-600'}`}>
              <div className="absolute -right-6 -top-6 opacity-10 rotate-12">{caloriePercent >= 100 ? <AlertTriangle size={120} /> : <Target size={120} />}</div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">Calories Aujourd'hui</p>
              <div className="flex items-baseline gap-1"><span className="text-5xl font-black">{totalCaloriesToday}</span><span className="text-lg opacity-70 font-bold">/ {calorieLimit} kcal</span></div>
              <div className="mt-4 w-full bg-black/10 rounded-full h-2 overflow-hidden"><div className="h-full bg-white transition-all duration-700" style={{ width: `${Math.min(caloriePercent, 100)}%` }}></div></div>
            </div>

            {/* WATER */}
            <div className="bg-white border rounded-3xl p-5 shadow-sm flex justify-between items-center">
              <div><h3 className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-2"><Droplets size={14} className="text-blue-500" /> Eau</h3><div className="flex items-baseline gap-1"><span className="text-3xl font-black">{(dailyWater * 0.25).toFixed(1)}</span><span className="text-xs font-bold text-slate-400 uppercase">Litres</span></div></div>
              <div className="flex gap-1"><button onClick={() => updateWater(-1)} className="w-8 h-8 bg-slate-50 rounded-lg text-slate-400 flex items-center justify-center"><Minus size={16} /></button><button onClick={() => updateWater(1)} className="w-8 h-8 bg-blue-600 rounded-lg text-white flex items-center justify-center"><Plus size={16} /></button></div>
            </div>

            {/* MEALS */}
            {['Matin', 'Midi', 'Collation', 'Soir'].map((time) => (
              <div key={time} className="bg-white border rounded-3xl p-4 shadow-sm space-y-3">
                <div className="flex justify-between items-center"><h3 className="font-black text-xs uppercase text-slate-800">{time}</h3><span className="text-[10px] font-black text-slate-400">{dailyMeals[time]?.reduce((a,b) => a+(parseInt(b.calories)||0), 0)} kcal</span></div>
                <div className="space-y-2">
                  {dailyMeals[time]?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs"><div className="flex-1"><p className="font-bold text-slate-700">{item.name}</p><p className="text-slate-400">{item.calories} kcal</p></div><button onClick={async () => removeFoodItem(time, item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button></div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddModal(time)} className="flex-1 py-2 bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl text-[10px] font-black text-slate-400 uppercase flex items-center justify-center gap-1 hover:text-indigo-600 transition-colors"><Plus size={14} /> Ajouter</button>
                  <label className="w-12 h-10 bg-indigo-50 border-2 border-dashed border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-400 cursor-pointer"><Camera size={18} /><input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, time)} /></label>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'analyse' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center"><h2 className="text-lg font-black uppercase flex items-center gap-2"><ChartIcon size={20} className="text-indigo-600" /> Analyse</h2><div className="bg-white p-1 rounded-xl border flex gap-1 shadow-sm">{['1J', '7J', '1M'].map(p => (<button key={p} onClick={() => setAnalysePeriod(p)} className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${analysePeriod === p ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{p}</button>))}</div></div>
            
            <div className={`rounded-3xl p-5 text-white shadow-lg relative overflow-hidden transition-colors duration-500 ${caloriePercent >= 100 ? 'bg-red-700' : 'bg-indigo-700'}`}>
              <div className="absolute top-0 right-0 p-4 opacity-10"><ChefHat size={60} /></div>
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2"><Lightbulb size={12} className="text-amber-300" /> BILAN GEMINI</h3>
              {insightLoading ? <div className="flex items-center gap-3 py-2"><Loader2 size={16} className="animate-spin" /><p className="text-xs italic opacity-80">Analyse en cours...</p></div> : <p className="text-sm font-bold leading-relaxed italic">"{geminiInsight || "Configure ton profil et tes repas pour avoir mon avis !"}"</p>}
            </div>

            <div className="bg-white border rounded-3xl p-5 shadow-sm space-y-8">
              <div><h3 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><TrendingUp size={14} className="text-indigo-500" /> Calories</h3><SimpleLineChart data={analysePeriod === '1J' ? (()=>{const s=[{label:'Début',value:0}];let c=0;['Matin','Midi','Collation','Soir'].forEach(t=>(dailyMeals[t]||[]).forEach(i=>{c+=i.calories;s.push({label:i.name.substring(0,8),value:c})}));return s})() : historyLogs.slice(analysePeriod === '7J' ? -7 : -30).map(l => ({ label: l.date.split('-')[2], value: Object.values(l.meals||{}).flat().reduce((a,b)=>a+(parseInt(b.calories)||0),0) }))} color={caloriePercent >= 100 ? "#ef4444" : "#4f46e5"} targetLine={analysePeriod === '1J' ? (calorieLimit > 0 ? calorieLimit : null) : null} /></div>
              <div className="pt-8 border-t"><h3 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2"><Scale size={14} className="text-emerald-500" /> Poids</h3><SimpleLineChart data={weightHistory.slice(analysePeriod === '7J' ? -7 : -30).map(d => ({ label: d.date.split('-')[2], value: d.value }))} color="#10b981" targetLine={parseFloat(profile.targetWeight) || null} /></div>
            </div>
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="space-y-4 animate-in fade-in">
            <h2 className="text-lg font-black uppercase flex items-center gap-2"><Search size={20} className="text-indigo-600" /> Guide de Survie</h2>
            {FOOD_GUIDE.map((item, i) => (
              <div key={i} className="bg-white border rounded-3xl p-5 shadow-sm">
                <h3 className="font-black text-indigo-700 text-xs uppercase mb-3 flex items-center gap-2"><span className="w-1.5 h-4 bg-indigo-600 rounded-full"></span> {item.cat}</h3>
                <div className="space-y-3">
                  <div className="bg-red-50 p-3 rounded-2xl border border-red-100 text-[11px] text-red-900 leading-tight"><span className="font-black text-[9px] text-red-700 block mb-1 uppercase">❌ STOP</span>{item.ban}</div>
                  <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-[11px] text-emerald-900 leading-tight"><span className="font-black text-[9px] text-emerald-700 block mb-1 uppercase">✅ GO</span>{item.replace}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'gemini' && (
          <div className="space-y-4 flex flex-col h-[70vh]">
            <h2 className="text-lg font-black uppercase flex items-center gap-2"><MessageSquare size={20} className="text-indigo-600" /> Coach AI</h2>
            <div className="flex-1 bg-white border rounded-3xl p-4 shadow-inner overflow-y-auto space-y-4">
              {chatHistory.map((msg, i) => (<div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] p-3 rounded-2xl text-xs font-medium leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none shadow-md' : 'bg-slate-100 border text-slate-800 rounded-tl-none'}`}>{msg.text && msg.text.split(/(\*\*.*?\*\*)/g).map((part, i) => part.startsWith('**') ? <b key={i} className="font-bold">{part.slice(2,-2)}</b> : part)}</div></div>))}
              {geminiLoading && <div className="flex justify-start"><Loader2 size={14} className="animate-spin text-indigo-500" /></div>}
            </div>
            <div className="flex gap-2 items-center bg-white p-2 border rounded-2xl shadow-sm"><label className="p-3 bg-slate-100 rounded-xl cursor-pointer hover:bg-slate-200"><Camera size={18} /><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e)} className="hidden" /></label><input value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && (async () => { const msg = inputMessage; setInputMessage(""); setChatHistory(p => [...p, { role: 'user', text: msg }]); const res = await callGemini(msg); setChatHistory(p => [...p, { role: 'model', text: res }]); })()} placeholder="Ta question ?" className="flex-1 outline-none text-xs font-bold px-2" /><button onClick={async () => { const msg = inputMessage; setInputMessage(""); setChatHistory(p => [...p, { role: 'user', text: msg }]); const res = await callGemini(msg); setChatHistory(p => [...p, { role: 'model', text: res }]); }} className="p-3 bg-indigo-600 text-white rounded-xl shadow-md"><ChevronRight size={18} /></button></div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-6 animate-in zoom-in-95">
            <h2 className="text-lg font-black uppercase flex items-center gap-2"><Settings size={20} className="text-indigo-600" /> Profil</h2>
            <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-2xl border font-bold">
                  <label className="text-[8px] font-black text-slate-400 uppercase block mb-1 italic">Limite Kcal / Jour</label>
                  <input type="number" value={profile.maxCalories} onChange={(e) => setProfile({...profile, maxCalories: e.target.value})} className="bg-transparent font-black text-xl text-red-600 outline-none w-full" />
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border font-bold">
                  <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Âge</label>
                  <input type="number" value={profile.age} onChange={(e) => setProfile({...profile, age: e.target.value})} className="bg-transparent font-black text-xl text-slate-700 outline-none w-full" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-slate-50 p-3 rounded-2xl border">
                  <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Actuel (kg)</label>
                  <input type="number" value={profile.weight} onChange={(e) => setProfile({...profile, weight: e.target.value})} className="bg-transparent font-black text-xl text-indigo-600 outline-none w-full" />
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border">
                  <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Taille (cm)</label>
                  <input type="number" value={profile.height} onChange={(e) => setProfile({...profile, height: e.target.value})} className="bg-transparent font-black text-xl text-slate-700 outline-none w-full" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="bg-slate-50 p-3 rounded-2xl border">
                  <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Cible (kg)</label>
                  <input type="number" value={profile.targetWeight} onChange={(e) => setProfile({...profile, targetWeight: e.target.value})} className="bg-transparent font-black text-xl text-emerald-600 outline-none w-full" />
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border">
                  <label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Activité</label>
                  <select 
                    value={profile.activityLevel} 
                    onChange={(e) => setProfile({...profile, activityLevel: e.target.value})}
                    className="bg-transparent font-black text-sm text-slate-700 outline-none w-full mt-1 border-none"
                  >
                    <option value="Sédentaire">Sédentaire</option>
                    <option value="Modéré">Modéré</option>
                    <option value="Actif">Actif / Sportif</option>
                  </select>
                </div>
              </div>

              <button onClick={async () => {
                const weightVal = parseFloat(profile.weight);
                const updated = {
                  ...profile, 
                  weight: weightVal, 
                  height: parseFloat(profile.height), 
                  age: parseInt(profile.age),
                  targetWeight: parseFloat(profile.targetWeight), 
                  maxCalories: parseInt(profile.maxCalories),
                  initialWeight: profile.initialWeight === 0 ? weightVal : profile.initialWeight
                };
                await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'main'), updated);
                await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'weightLogs', currentDate), { weight: weightVal });
                setActiveTab('dashboard');
              }} className="w-full py-4 mt-2 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all">Enregistrer le Profil</button>
            </div>
          </div>
        )}

        <footer className="mt-8 mb-4 text-center">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] italic opacity-50">
            © Sandeep-Singh NIRMAL 2026
          </p>
        </footer>
      </main>

      <nav className={`fixed bottom-0 left-0 right-0 border-t px-6 py-4 flex justify-between items-end z-40 transition-colors duration-500 shadow-[0_-8px_20px_rgba(0,0,0,0.05)] ${caloriePercent >= 100 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 flex-1 ${activeTab === 'dashboard' ? (caloriePercent >= 100 ? 'text-red-600' : 'text-indigo-600') : 'text-slate-400'}`}><Utensils size={22} strokeWidth={3} /><span className="text-[8px] font-black uppercase">Journal</span></button>
        <button onClick={() => setActiveTab('analyse')} className={`flex flex-col items-center gap-1 flex-1 ${activeTab === 'analyse' ? (caloriePercent >= 100 ? 'text-red-600' : 'text-indigo-600') : 'text-slate-400'}`}><ChartIcon size={22} strokeWidth={3} /><span className="text-[8px] font-black uppercase">Analyse</span></button>
        <div className="flex-1 flex justify-center pb-2"><label className={`flex items-center justify-center w-14 h-14 rounded-2xl shadow-xl cursor-pointer active:scale-90 transition-all ring-4 ring-white ${caloriePercent >= 100 ? 'bg-red-600' : 'bg-indigo-600'} text-white`}><Camera size={26} /><input type="file" accept="image/*" onChange={(e) => handleImageUpload(e)} className="hidden" /></label></div>
        <button onClick={() => setActiveTab('guide')} className={`flex flex-col items-center gap-1 flex-1 ${activeTab === 'guide' ? (caloriePercent >= 100 ? 'text-red-600' : 'text-indigo-600') : 'text-slate-400'}`}><Search size={22} strokeWidth={3} /><span className="text-[8px] font-black uppercase">Guide</span></button>
        <button onClick={() => setActiveTab('gemini')} className={`flex flex-col items-center gap-1 flex-1 ${activeTab === 'gemini' ? (caloriePercent >= 100 ? 'text-red-600' : 'text-indigo-600') : 'text-slate-400'}`}><MessageSquare size={22} strokeWidth={3} /><span className="text-[8px] font-black uppercase">Coach</span></button>
      </nav>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"><div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95"><div className="flex justify-between items-center"><h3 className="font-black text-sm uppercase">Ajouter au {showAddModal}</h3><button onClick={() => setShowAddModal(null)} className="text-slate-300"><X size={20} /></button></div><div className="space-y-4"><input id="foodName" type="text" placeholder="Ex: Poulet grillé" className="w-full bg-slate-50 border rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" /><input id="foodCals" type="number" placeholder="Calories" className="w-full bg-slate-50 border rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" /><button onClick={() => {const n=document.getElementById('foodName').value; const c=document.getElementById('foodCals').value; if(n&&c) addFoodItem(showAddModal,n,c);}} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs shadow-md">Ajouter</button></div></div></div>
      )}
    </div>
  );
}