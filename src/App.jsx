import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { 
  Plus, Trash2, User, Settings, Camera, MessageSquare, ChevronRight, CheckCircle2, 
  XCircle, Utensils, Target, Search, Scale, Loader2, LineChart as ChartIcon, 
  TrendingUp, Calendar, X, Droplets, Minus, Flag, Trophy, AlertTriangle, Zap, Lightbulb, ChefHat, Info
} from 'lucide-react';

// ==========================================
// 1. CONFIGURATION FIREBASE
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
// 2. RÉCUPÉRATION SÉCURISÉE DE LA CLÉ GEMINI
// ==========================================
// Accès sécurisé pour éviter l'erreur de build es2015 sur import.meta
const getEnv = (key) => {
  try {
    const meta = import.meta;
    return meta.env[key] || "";
  } catch (e) {
    return "";
  }
};

const GEMINI_API_KEY = getEnv('VITE_GEMINI_API_KEY');

const FOOD_GUIDE = [
  { cat: "Boulangerie", ban: "Croissants, Pains au chocolat, Brioches, Pain blanc.", replace: "Pain complet, seigle." },
  { cat: "Petit-Déj", ban: "Céréales sucrées, Pain de mie.", replace: "Flocons d'avoine, œufs." },
  { cat: "Snacks", ban: "Kinder, Snickers, Oreos, Bonbons.", replace: "Amandes, Pomme, Choco noir 85%." },
  { cat: "Boissons", ban: "Sodas, Jus de fruits, Ice Tea.", replace: "Eau, Thé, Café noir." },
  { cat: "Sauces", ban: "Ketchup, Mayonnaise, Soja sucrée.", replace: "Moutarde, Citron, Épices." }
];

const SimpleLineChart = ({ data, color = "#4f46e5", height = 150, targetLine = null }) => {
  const chartData = data.length === 0 ? [] : (data.length === 1 ? [{label: 'Démarrage', value: 0}, ...data] : data);
  if (chartData.length < 2) return <div className="h-[150px] flex items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-[10px] text-slate-400 font-black uppercase italic text-center px-4 font-bold">Ajoute des repas pour voir la courbe</div>;
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
    weight: 0, height: 0, age: 0, gender: "Homme", activityLevel: "Modéré", 
    name: "Utilisateur", targetWeight: 0, initialWeight: 0, maxCalories: 0 
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
  const [calculatingIA, setCalculatingIA] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    const initAuth = async () => {
      try {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
          if (u) {
            setUser(u);
            loadUserData(u.uid);
          } else {
            const result = await signInAnonymously(auth);
            setUser(result.user);
            loadUserData(result.user.uid);
          }
        });
        return unsubscribe;
      } catch (error) {
        setLoading(false);
      }
    };
    initAuth();
  }, [currentDate]);

  const loadUserData = (uid) => {
    const unsubscribeProfile = onSnapshot(doc(db, 'artifacts', appId, 'users', uid, 'profile', 'main'), (snap) => {
      if (snap.exists()) setProfile(snap.data());
      setLoading(false);
    });

    onSnapshot(doc(db, 'artifacts', appId, 'users', uid, 'logs', currentDate), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDailyMeals(data.meals || { Matin: [], Midi: [], Collation: [], Soir: [] });
        setDailyWater(data.water || 0);
      } else {
        setDailyMeals({ Matin: [], Midi: [], Collation: [], Soir: [] });
        setDailyWater(0);
      }
    });

    onSnapshot(collection(db, 'artifacts', appId, 'users', uid, 'logs'), (s) => {
      setHistoryLogs(s.docs.map(d => ({ date: d.id, ...d.data() })).sort((a,b) => a.date.localeCompare(b.date)));
    });

    onSnapshot(collection(db, 'artifacts', appId, 'users', uid, 'weightLogs'), (s) => {
      setWeightHistory(s.docs.map(d => ({ date: d.id, value: d.data().weight })).sort((a,b) => a.date.localeCompare(b.date)));
    });

    return () => unsubscribeProfile();
  };

  const showToast = (text, type = "info") => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage({ text: "", type: "" }), 5000);
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

  // --- LOGIQUE GEMINI SÉCURISÉE AVEC SUPPORT IMAGE ---
  const callGemini = async (prompt, systemInstruction, imageBase64 = null, responseMimeType = "text/plain") => {
    if (!GEMINI_API_KEY) {
      throw new Error("Clé API manquante");
    }
    
    let parts = [{ text: prompt }];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: "image/png", data: imageBase64 } });
    }

    const payload = {
      contents: [{ parts }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { responseMimeType }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("IA indisponible");
    const data = await response.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!result) throw new Error("Réponse vide");
    return result;
  };

  // --- ANALYSE PHOTO POUR JOURNAL ---
  const handleMealPhoto = (e, time) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      showToast("L'IA analyse ton repas...", "info");
      try {
        const res = await callGemini(
          "Analyse cette photo de nourriture. Retourne UNIQUEMENT un JSON: {\"name\": \"Nom court du plat\", \"calories\": 000}",
          "Tu es un expert en nutrition. Réponds en JSON.",
          base64,
          "application/json"
        );
        const data = JSON.parse(res);
        addFoodItem(time, data.name, data.calories);
        showToast(`Ajouté : ${data.name} (${data.calories} kcal)`, "success");
      } catch (e) {
        showToast("Erreur d'analyse photo. Vérifie ta clé API.", "error");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCoachChat = async (imageBase64 = null) => {
    const msg = inputMessage || (imageBase64 ? "Analyse mon plat." : "");
    if (!msg.trim() && !imageBase64) return;
    
    if (!imageBase64) setInputMessage("");
    setChatHistory(p => [...p, { role: 'user', text: imageBase64 ? "[Photo envoyée]" : msg }]);
    setGeminiLoading(true);

    try {
      const p = profile;
      const profilText = p.weight > 0 ? `${p.gender}, ${p.weight}kg, ${p.height}cm, ${p.age}ans, Activité: ${p.activityLevel}` : "Profil non rempli";
      const system = `Coach Expert Sèche. Profil actuel: ${profilText}. Aujourd'hui: ${totalCaloriesToday}/${calorieLimit} kcal. 
      RÈGLES: Réponds en 4 lignes MAX. Direct et motivant. Utilise le **gras**. 
      VERDICTS OBLIGATOIRES pour repas: '✅ VALIDÉ', '⚠️ ATTENTION' (pas de sauce/finit pas tout), ou '❌ STOP' (mauvais pour sèche).`;
      
      const res = await callGemini(msg, system, imageBase64);
      setChatHistory(p => [...p, { role: 'model', text: res }]);
    } catch (e) {
      setChatHistory(p => [...p, { role: 'model', text: "Erreur : Clé API non détectée sur Vercel. Fais un 'Redeploy' après l'avoir ajoutée." }]);
    } finally {
      setGeminiLoading(false);
    }
  };

  const handleChatPhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      handleCoachChat(base64);
    };
    reader.readAsDataURL(file);
  };

  // --- CALCULATEUR DE PROFIL IA ---
  const calculateIA = async () => {
    if (!profile.weight || !profile.height || !profile.age) {
      showToast("Remplis d'abord ton Poids, Taille et Âge !", "error");
      return;
    }
    setCalculatingIA(true);
    try {
      const prompt = `Analyse mon profil : ${profile.gender}, ${profile.weight}kg, ${profile.height}cm, ${profile.age}ans, Activité: ${profile.activityLevel}.
      1. Calcule mon métabolisme de base (BMR).
      2. Défini ma limite calorique pour une sèche efficace (perte de gras).
      3. Suggère un objectif de poids cible réaliste (-5kg environ si possible).
      Retourne UNIQUEMENT un JSON: {"bmr": 0, "daily_limit": 0, "suggested_target": 0, "msg": "courte motivation"}`;
      
      const res = await callGemini(prompt, "Expert nutrition. Réponds uniquement en JSON.", null, "application/json");
      const data = JSON.parse(res);
      
      setProfile(prev => ({ ...prev, maxCalories: data.daily_limit, targetWeight: data.suggested_target }));
      showToast(`Métabolisme: ${data.bmr}kcal. Objectifs calculés par l'IA !`, "success");
    } catch (e) {
      showToast("Erreur IA : Vérifie ta clé sur Vercel et refais un Redeploy.", "error");
    } finally {
      setCalculatingIA(false);
    }
  };

  const generateInsight = async () => {
    if (insightLoading || !GEMINI_API_KEY || totalCaloriesToday === 0) return;
    setInsightLoading(true);
    try {
      const system = `Expert Sèche. Profil: ${profile.weight}kg. Cal: ${totalCaloriesToday}/${calorieLimit}.`;
      const res = await callGemini("Analyse mes repas du jour et donne-moi un verdict global et un conseil stratégique.", system);
      setGeminiInsight(res);
    } catch (e) { setGeminiInsight("Analyse indisponible."); } finally { setInsightLoading(false); }
  };

  useEffect(() => { if (activeTab === 'analyse' && totalCaloriesToday > 0) generateInsight(); }, [activeTab]);

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-50"><div className="text-center space-y-4 font-bold"><Loader2 className="animate-spin text-indigo-600 mx-auto" size={40} /><p className="text-[10px] font-black uppercase text-slate-400 tracking-widest animate-pulse">Synchronisation...</p></div></div>;

  return (
    <div className={`min-h-screen transition-all duration-700 pb-28 font-sans ${caloriePercent >= 100 ? 'bg-red-50' : 'bg-slate-50'}`}>
      <header className={`border-b sticky top-0 z-30 p-4 flex justify-between items-center transition-colors duration-500 shadow-sm ${caloriePercent >= 100 ? 'bg-red-600 text-white border-red-500' : 'bg-white'}`}>
        <div><h1 className="text-xl font-black italic tracking-tighter leading-none">FITCOACH 2.0</h1><p className={`text-[9px] font-black uppercase mt-1 ${caloriePercent >= 100 ? 'text-red-100' : 'text-slate-400'}`}>Discipline • Sèche</p></div>
        <button onClick={() => setActiveTab('profile')} className={`p-2 rounded-full ${caloriePercent >= 100 ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}><User size={20} /></button>
      </header>

      {statusMessage.text && (
        <div className={`fixed top-20 left-4 right-4 z-50 p-4 rounded-2xl shadow-xl border flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 ${statusMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-indigo-600 border-indigo-500 text-white'}`}>
          {statusMessage.type === 'error' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
          <p className="text-xs font-black uppercase tracking-tight">{statusMessage.text}</p>
        </div>
      )}

      <main className="max-w-md mx-auto p-4 space-y-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white border-2 border-slate-100 rounded-3xl p-5 shadow-sm font-bold">
              <div className="flex justify-between items-center mb-3 font-bold"><div className="flex items-center gap-2"><Trophy size={16} className="text-amber-500" /><h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Objectif {profile.targetWeight}kg</h3></div><span className="text-lg font-black text-indigo-600">{weightProgress.percent}%</span></div>
              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${weightProgress.percent}%` }}></div></div>
            </div>
            <div className={`rounded-3xl p-6 text-white shadow-xl transition-all duration-500 relative overflow-hidden ${caloriePercent >= 100 ? 'bg-red-600 animate-pulse' : caloriePercent >= 80 ? 'bg-amber-500' : 'bg-indigo-600'}`}>
              <div className="absolute -right-6 -top-6 opacity-10 rotate-12"><Target size={120} /></div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">Calories Aujourd'hui</p>
              <div className="flex items-baseline gap-1 font-bold"><span className="text-5xl font-black">{totalCaloriesToday}</span><span className="text-lg opacity-70 font-bold">/ {calorieLimit} kcal</span></div>
              <div className="mt-4 w-full bg-black/10 rounded-full h-2 overflow-hidden"><div className="h-full bg-white transition-all duration-700" style={{ width: `${Math.min(caloriePercent, 100)}%` }}></div></div>
            </div>
            <div className="bg-white border rounded-3xl p-5 shadow-sm flex justify-between items-center font-bold">
              <div><h3 className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-2"><Droplets size={14} className="text-blue-500" /> Eau</h3><div className="flex items-baseline gap-1 font-bold"><span className="text-3xl font-black">{(dailyWater * 0.25).toFixed(1)}</span><span className="text-xs font-bold text-slate-400 uppercase">Litres</span></div></div>
              <div className="flex gap-1"><button onClick={() => updateWater(-1)} className="w-8 h-8 bg-slate-50 rounded-lg text-slate-400 flex items-center justify-center"><Minus size={16} /></button><button onClick={() => updateWater(1)} className="w-8 h-8 bg-blue-600 rounded-lg text-white flex items-center justify-center"><Plus size={16} /></button></div>
            </div>
            {['Matin', 'Midi', 'Collation', 'Soir'].map((time) => (
              <div key={time} className="bg-white border rounded-3xl p-4 shadow-sm space-y-3 font-bold">
                <div className="flex justify-between items-center"><h3 className="font-black text-xs uppercase text-slate-800">{time}</h3><span className="text-[10px] font-black text-slate-400">{dailyMeals[time]?.reduce((a,b) => a+(parseInt(b.calories)||0), 0)} kcal</span></div>
                <div className="space-y-2">
                  {dailyMeals[time]?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs font-bold text-slate-700">
                      <div className="flex-1 font-bold font-bold"><p>{item.name}</p><p className="text-[10px] opacity-50 font-bold">{item.calories} kcal</p></div>
                      <button onClick={async () => removeFoodItem(time, item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddModal(time)} className="flex-1 py-2 bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl text-[10px] font-black text-slate-400 uppercase flex items-center justify-center gap-1 hover:text-indigo-600 transition-colors font-bold"><Plus size={14} /> Ajouter</button>
                  <label className="w-12 h-10 bg-indigo-50 border-2 border-dashed border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-400 cursor-pointer hover:bg-indigo-100 transition-colors">
                    <Camera size={18} />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleMealPhoto(e, time)} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'analyse' && (
          <div className="space-y-6 animate-in fade-in font-bold">
            <div className="flex justify-between items-center"><h2 className="text-lg font-black uppercase flex items-center gap-2"><ChartIcon size={20} className="text-indigo-600" /> Analyse</h2><div className="bg-white p-1 rounded-xl border flex gap-1 shadow-sm font-bold">{['1J', '7J', '1M'].map(p => (<button key={p} onClick={() => setAnalysePeriod(p)} className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all font-bold ${analysePeriod === p ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>{p}</button>))}</div></div>
            <div className={`rounded-3xl p-5 text-white shadow-lg relative overflow-hidden transition-colors duration-500 font-bold ${caloriePercent >= 100 ? 'bg-red-700' : 'bg-indigo-700'}`}>
              <div className="absolute top-0 right-0 p-4 opacity-10"><ChefHat size={60} /></div>
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2 font-bold"><Lightbulb size={12} className="text-amber-300" /> BILAN DU COACH</h3>
              {insightLoading ? <div className="flex items-center gap-3 py-2 font-bold"><Loader2 size={16} className="animate-spin text-amber-300" /><p className="text-xs italic opacity-80 font-bold font-bold">Analyse...</p></div> : <p className="text-sm font-bold leading-relaxed italic">"{geminiInsight || "Configure ton profil et tes repas !"}"</p>}
            </div>
            <div className="bg-white border rounded-3xl p-5 shadow-sm space-y-8 font-bold font-bold">
              <div><h3 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2 font-bold font-bold font-bold"><TrendingUp size={14} className="text-indigo-500" /> Calories</h3><SimpleLineChart data={analysePeriod === '1J' ? (()=>{const s=[{label:'Début',value:0}];let c=0;['Matin','Midi','Collation','Soir'].forEach(t=>(dailyMeals[t]||[]).forEach(i=>{c+=i.calories;s.push({label:i.name.substring(0,8),value:c})}));return s})() : historyLogs.slice(analysePeriod === '7J' ? -7 : -30).map(l => ({ label: l.date.split('-')[2], value: Object.values(l.meals||{}).flat().reduce((a,b)=>a+(parseInt(b.calories)||0),0) }))} color={caloriePercent >= 100 ? "#ef4444" : "#4f46e5"} targetLine={analysePeriod === '1J' ? (calorieLimit > 0 ? calorieLimit : null) : null} /></div>
              <div className="pt-8 border-t font-bold font-bold font-bold"><h3 className="text-[10px] font-black uppercase text-slate-400 mb-4 flex items-center gap-2 font-bold font-bold font-bold"><Scale size={14} className="text-emerald-500" /> Poids</h3><SimpleLineChart data={weightHistory.slice(analysePeriod === '7J' ? -7 : -30).map(d => ({ label: d.date.split('-')[2], value: d.value }))} color="#10b981" targetLine={parseFloat(profile.targetWeight) || null} /></div>
            </div>
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="space-y-4 animate-in fade-in font-bold font-bold">
            <h2 className="text-lg font-black uppercase flex items-center gap-2"><Search size={20} className="text-indigo-600" /> Guide de Survie</h2>
            {FOOD_GUIDE.map((item, i) => (
              <div key={i} className="bg-white border rounded-3xl p-5 shadow-sm font-bold font-bold">
                <h3 className="font-black text-indigo-700 text-xs uppercase mb-3 flex items-center gap-2 font-bold"><span className="w-1.5 h-4 bg-indigo-600 rounded-full font-bold"></span> {item.cat}</h3>
                <div className="space-y-3 font-bold font-bold">
                  <div className="bg-red-50 p-3 rounded-2xl border border-red-100 text-[11px] text-red-900 leading-tight font-bold font-bold font-bold"><span className="font-black text-[9px] text-red-700 block mb-1 uppercase font-bold">❌ STOP</span>{item.ban}</div>
                  <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-[11px] text-emerald-900 leading-tight font-bold font-bold font-bold"><span className="font-black text-[9px] text-emerald-700 block mb-1 uppercase font-bold">✅ GO</span>{item.replace}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'gemini' && (
          <div className="space-y-4 flex flex-col h-[70vh] font-bold font-bold">
            <h2 className="text-lg font-black uppercase flex items-center gap-2"><MessageSquare size={20} className="text-indigo-600" /> Coach AI</h2>
            <div className="flex-1 bg-white border rounded-3xl p-4 shadow-inner overflow-y-auto space-y-4 font-bold font-bold font-bold">
              {chatHistory.map((msg, i) => (<div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} font-bold`}><div className={`max-w-[85%] p-3 rounded-2xl text-xs font-bold font-bold ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none shadow-md' : 'bg-slate-100 border text-slate-800 rounded-tl-none font-bold'}`}>{msg.text}</div></div>))}
              {geminiLoading && <div className="flex justify-start font-bold font-bold"><Loader2 size={14} className="animate-spin text-indigo-500" /></div>}
            </div>
            <div className="flex gap-2 items-center bg-white p-2 border rounded-2xl shadow-sm font-bold font-bold font-bold font-bold">
              <label className="p-3 bg-slate-100 rounded-xl cursor-pointer hover:bg-slate-200 font-bold font-bold transition-colors">
                <Camera size={18} />
                <input type="file" accept="image/*" className="hidden" onChange={handleChatPhoto} />
              </label>
              <input value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleCoachChat()} placeholder="Ta question ?" className="flex-1 outline-none text-xs font-bold px-2 font-bold font-bold" />
              <button onClick={() => handleCoachChat()} className="p-3 bg-indigo-600 text-white rounded-xl shadow-md font-bold font-bold font-bold"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-6 animate-in zoom-in-95 font-bold">
            <h2 className="text-lg font-black uppercase flex items-center gap-2"><Settings size={20} className="text-indigo-600" /> Profil Personnel</h2>
            <div className="bg-white border rounded-3xl p-6 shadow-sm space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-2xl border"><label className="text-[8px] font-black text-slate-400 uppercase block mb-1">Sexe</label>
                  <select value={profile.gender} onChange={(e) => setProfile({...profile, gender: e.target.value})} className="bg-transparent font-black text-sm text-slate-700 outline-none w-full border-none">
                    <option value="Homme">Homme</option>
                    <option value="Femme">Femme</option>
                  </select>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border font-bold"><label className="text-[8px] font-black text-slate-400 uppercase block mb-1 font-bold">Âge</label><input type="number" value={profile.age} onChange={(e) => setProfile({...profile, age: e.target.value})} className="bg-transparent font-black text-xl text-slate-700 outline-none w-full font-bold" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-2xl border font-bold font-bold"><label className="text-[8px] font-black text-slate-400 uppercase block mb-1 font-bold">Actuel (kg)</label><input type="number" value={profile.weight} onChange={(e) => setProfile({...profile, weight: e.target.value})} className="bg-transparent font-black text-xl text-indigo-600 outline-none w-full font-bold" /></div>
                <div className="bg-slate-50 p-3 rounded-2xl border font-bold font-bold"><label className="text-[8px] font-black text-slate-400 uppercase block mb-1 font-bold">Taille (cm)</label><input type="number" value={profile.height} onChange={(e) => setProfile({...profile, height: e.target.value})} className="bg-transparent font-black text-xl text-slate-700 outline-none w-full font-bold font-bold" /></div>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border font-bold"><label className="text-[8px] font-black text-slate-400 uppercase block mb-1 font-bold">Niveau d'activité</label>
                <select value={profile.activityLevel} onChange={(e) => setProfile({...profile, activityLevel: e.target.value})} className="bg-transparent font-black text-sm text-slate-700 outline-none w-full border-none">
                  <option value="Sédentaire">Sédentaire (Bureau)</option>
                  <option value="Modéré">Modéré (Sport 1-2 fois/sem)</option>
                  <option value="Actif">Actif (Sport 3-5 fois/sem)</option>
                  <option value="Sportif">Intense (Sport quotidien)</option>
                </select>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-3xl space-y-3">
                <div className="flex justify-between items-center"><span className="text-[9px] font-black text-indigo-400 uppercase italic">Assistant IA</span><Zap size={14} className="text-indigo-400" /></div>
                <button onClick={calculateIA} disabled={calculatingIA} className="w-full py-3 bg-white border-2 border-indigo-200 text-indigo-600 rounded-2xl text-xs font-black uppercase flex items-center justify-center gap-2 hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                  {calculatingIA ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                  Calculer mes objectifs avec l'IA
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 font-bold font-bold">
                <div className="bg-red-50 p-3 rounded-2xl border font-bold font-bold border-red-100"><label className="text-[8px] font-black text-red-400 uppercase block mb-1 font-bold">Limite Calories</label><input type="number" value={profile.maxCalories} onChange={(e) => setProfile({...profile, maxCalories: e.target.value})} className="bg-transparent font-black text-xl text-red-600 outline-none w-full font-bold" /></div>
                <div className="bg-emerald-50 p-3 rounded-2xl border font-bold font-bold border-emerald-100"><label className="text-[8px] font-black text-emerald-400 uppercase block mb-1 font-bold">Objectif (kg)</label><input type="number" value={profile.targetWeight} onChange={(e) => setProfile({...profile, targetWeight: e.target.value})} className="bg-transparent font-black text-xl text-emerald-600 outline-none w-full font-bold font-bold" /></div>
              </div>
              <button onClick={async () => {
                const weightVal = parseFloat(profile.weight);
                const updated = { ...profile, weight: weightVal, height: parseFloat(profile.height), age: parseInt(profile.age), targetWeight: parseFloat(profile.targetWeight), maxCalories: parseInt(profile.maxCalories), initialWeight: profile.initialWeight === 0 ? weightVal : profile.initialWeight };
                await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'main'), updated);
                await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'weightLogs', currentDate), { weight: weightVal });
                showToast("Profil sauvegardé !", "success");
                setActiveTab('dashboard');
              }} className="w-full py-4 mt-2 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-widest text-xs shadow-lg font-bold font-bold">Sauvegarder</button>
            </div>
          </div>
        )}

        <footer className="mt-8 mb-4 text-center font-bold font-bold">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] italic opacity-50 font-bold font-bold font-bold">
            © Sandeep-Singh NIRMAL 2026
          </p>
        </footer>
      </main>

      <nav className={`fixed bottom-0 left-0 right-0 border-t px-6 py-4 flex justify-between items-end z-40 transition-colors duration-500 shadow-[0_-8px_20px_rgba(0,0,0,0.05)] font-bold ${caloriePercent >= 100 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 flex-1 font-bold font-bold ${activeTab === 'dashboard' ? (caloriePercent >= 100 ? 'text-red-600' : 'text-indigo-600') : 'text-slate-400'}`}><Utensils size={22} strokeWidth={3} /><span className="text-[8px] font-black uppercase font-bold">Journal</span></button>
        <button onClick={() => setActiveTab('analyse')} className={`flex flex-col items-center gap-1 flex-1 font-bold font-bold ${activeTab === 'analyse' ? (caloriePercent >= 100 ? 'text-red-600' : 'text-indigo-600') : 'text-slate-400'}`}><ChartIcon size={22} strokeWidth={3} /><span className="text-[8px] font-black uppercase font-bold">Analyse</span></button>
        <button onClick={() => setActiveTab('guide')} className={`flex flex-col items-center gap-1 flex-1 font-bold font-bold ${activeTab === 'guide' ? (caloriePercent >= 100 ? 'text-red-600' : 'text-indigo-600') : 'text-slate-400'}`}><Search size={22} strokeWidth={3} /><span className="text-[8px] font-black uppercase font-bold">Guide</span></button>
        <button onClick={() => setActiveTab('gemini')} className={`flex flex-col items-center gap-1 flex-1 font-bold font-bold ${activeTab === 'gemini' ? (caloriePercent >= 100 ? 'text-red-600' : 'text-indigo-600') : 'text-slate-400'}`}><MessageSquare size={22} strokeWidth={3} /><span className="text-[8px] font-black uppercase font-bold">Coach</span></button>
      </nav>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 font-bold"><div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 font-bold font-bold font-bold"><div className="flex justify-between items-center font-bold"><h3 className="font-black text-sm uppercase text-slate-800 font-bold font-bold">Ajouter au {showAddModal}</h3><button onClick={() => setShowAddModal(null)} className="text-slate-300 font-bold"><X size={20} /></button></div><div className="space-y-4 font-bold"><input id="foodName" type="text" placeholder="Ex: Poulet grillé" className="w-full bg-slate-50 border rounded-2xl p-4 text-xs font-bold outline-none font-bold" /><input id="foodCals" type="number" placeholder="Kcal" className="w-full bg-slate-50 border rounded-2xl p-4 text-xs font-bold outline-none font-bold" /><button onClick={() => {const n=document.getElementById('foodName').value; const c=document.getElementById('foodCals').value; if(n&&c) addFoodItem(showAddModal,n,c);}} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs shadow-md font-bold">Ajouter</button></div></div></div>
      )}
    </div>
  );
}