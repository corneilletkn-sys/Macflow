// Fonction Vercel : écrit le script d'une vidéo avec une IA gratuite.
// Réservée aux utilisateurs connectés (vérification du jeton Firebase).
// Variables Vercel (une seule suffit) : GROQ_API_KEY, OPENROUTER_API_KEY ou GEMINI_API_KEY.
// Facultatif : GROQ_MODEL, OPENROUTER_MODEL, GEMINI_MODEL.
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyDGgForQKVSNPviUkd1WW-vTB10O0aa2FU";
const H = { "Content-Type": "application/json" };
const E = process.env;

async function viaOpenAI(url, key, model, prompt) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(Object.assign(
      { model, messages: [{ role: "user", content: prompt }], temperature: 0.9 },
      /gpt-oss/.test(model) ? { reasoning_effort: "low", max_completion_tokens: 1500 } : { max_tokens: 500 }
    ))
  });
  if (!r.ok) return "";
  const d = await r.json();
  return (((d.choices || [])[0] || {}).message || {}).content || "";
}

async function viaGemini(key, model, prompt) {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.9, maxOutputTokens: 500 }
    })
  });
  if (!r.ok) return "";
  const d = await r.json();
  const p = ((((d.candidates || [])[0] || {}).content || {}).parts || [])[0];
  return (p && p.text) || "";
}

module.exports = async (req, res) => {
  const out = (code, obj) => res.status(code).json(obj);
  if (req.method !== "POST") return out(405, { error: "Méthode non autorisée" });
  if (!E.GROQ_API_KEY && !E.OPENROUTER_API_KEY && !E.GEMINI_API_KEY) return out(500, { error: "Clé IA non configurée" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return out(401, { error: "Connexion requise" });
  try {
    const v = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY, {
      method: "POST", headers: H, body: JSON.stringify({ idToken: token })
    });
    if (!v.ok) return out(401, { error: "Connexion invalide" });
  } catch (e) { return out(401, { error: "Connexion invalide" }); }

  let topic = "";
  try { const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); topic = String(b.topic || "").trim().slice(0, 120); } catch (e) {}
  if (!topic) return out(400, { error: "Sujet manquant" });

  const prompt = "Écris le script d'une vidéo verticale d'environ 20 secondes en français sur : " + topic +
    ". Réponds uniquement par un tableau JSON de 5 à 6 chaînes très courtes (12 mots maximum chacune) : une accroche, 3 à 4 idées, un appel à l'action. Aucun autre texte.";

  let txt = "";
  try {
    if (E.GROQ_API_KEY) txt = await viaOpenAI("https://api.groq.com/openai/v1/chat/completions", E.GROQ_API_KEY, E.GROQ_MODEL || "openai/gpt-oss-120b", prompt);
    else if (E.OPENROUTER_API_KEY) txt = await viaOpenAI("https://openrouter.ai/api/v1/chat/completions", E.OPENROUTER_API_KEY, E.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free", prompt);
    else txt = await viaGemini(E.GEMINI_API_KEY, E.GEMINI_MODEL || "gemini-2.5-flash", prompt);
  } catch (e) { return out(502, { error: "Service IA indisponible" }); }

  let arr = [];
  try { const m = txt.match(/\[[\s\S]*\]/); arr = JSON.parse(m ? m[0] : "[]"); } catch (e) {}
  arr = (Array.isArray(arr) ? arr : []).map(x => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 8);
  if (!arr.length) return out(502, { error: "Réponse IA vide" });
  return out(200, { script: arr });
};
