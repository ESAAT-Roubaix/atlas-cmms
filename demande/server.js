// Formulaire public de demande de travaux -> API Atlas CMMS.
// Se connecte avec un compte de service (rôle Demandeur) et crée des demandes via POST /requests.
// Pièce jointe : nécessite FILE_ATTACHMENTS, activé par le correctif atlas-api/ (LOCAL_ENTITLEMENTS).
// Aucune dépendance : Node 22 fournit fetch, FormData et Request.formData().

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const API = process.env.ATLAS_API_URL || "http://api:8080";
const EMAIL = process.env.DEMANDE_EMAIL;
const PASSWORD = process.env.DEMANDE_PASSWORD;
const PORT = 3000;
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
const MAX_PJ = 10 * 1024 * 1024;

if (!EMAIL || !PASSWORD) {
  console.error("DEMANDE_EMAIL et DEMANDE_PASSWORD doivent être définis");
  process.exit(1);
}

const PAGE = fs.readFileSync(path.join(__dirname, "index.html"));

// ---- Session Atlas (le jeton expire au bout de 30 min, on le renouvelle à 20) ----
let token = null;
let tokenAt = 0;

async function login() {
  const res = await fetch(`${API}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, type: "client" }),
  });
  if (!res.ok) throw new Error(`Connexion Atlas impossible (${res.status})`);
  token = (await res.json()).accessToken;
  tokenAt = Date.now();
}

async function atlas(pathname, init = {}, retry = true) {
  if (!token || Date.now() - tokenAt > 20 * 60 * 1000) await login();
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) {
    token = null;
    return atlas(pathname, init, false);
  }
  return res;
}

// ---- Emplacements (cache 5 min) ----
let lieux = { at: 0, data: [] };

async function getLieux() {
  if (Date.now() - lieux.at < 5 * 60 * 1000) return lieux.data;
  const res = await atlas("/locations/mini");
  if (!res.ok) throw new Error(`Emplacements indisponibles (${res.status})`);
  const data = (await res.json())
    .map((l) => ({ id: l.id, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  lieux = { at: Date.now(), data };
  return data;
}

// ---- Anti-spam : limite par IP ----
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT.max;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) {
    if (list.every((t) => now - t >= RATE_LIMIT.windowMs)) hits.delete(ip);
  }
}, RATE_LIMIT.windowMs).unref();

// ---- Création de la demande ----
const PRIORITES = new Set(["LOW", "MEDIUM", "HIGH"]);

// Type réel du fichier d'après ses premiers octets (le type annoncé par le navigateur ne suffit pas)
function typePj(octets) {
  const hex = Buffer.from(octets.subarray(0, 12)).toString("hex");
  const ascii = Buffer.from(octets.subarray(0, 12)).toString("latin1");
  if (hex.startsWith("ffd8ff")) return { mime: "image/jpeg", image: true };
  if (hex.startsWith("89504e47")) return { mime: "image/png", image: true };
  if (ascii.startsWith("GIF8")) return { mime: "image/gif", image: true };
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return { mime: "image/webp", image: true };
  if (ascii.slice(4, 8) === "ftyp" && /^(heic|heix|mif1|msf1)$/.test(ascii.slice(8, 12)))
    return { mime: "image/heic", image: true };
  if (ascii.startsWith("%PDF-")) return { mime: "application/pdf", image: false };
  return null;
}

async function envoyerPj(fichier) {
  if (fichier.size > MAX_PJ) throw new Erreur("Pièce jointe trop lourde (10 Mo maximum).");
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const type = typePj(octets);
  if (!type) throw new Erreur("La pièce jointe doit être une photo (JPEG, PNG, HEIC…) ou un PDF.");
  const nom = (fichier.name || "piece-jointe").replace(/[^\w.\- ]+/g, "_").slice(0, 100);
  const fd = new FormData();
  fd.append("files", new Blob([octets], { type: type.mime }), nom);
  fd.append("hidden", "false");
  fd.append("type", type.image ? "IMAGE" : "OTHER");
  const res = await atlas("/files/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Envoi de la pièce jointe refusé (${res.status}) : ${await res.text()}`);
  const [enregistre] = await res.json();
  return { id: enregistre.id, image: type.image };
}

function champ(form, name, max) {
  return String(form.get(name) || "").trim().slice(0, max);
}

async function envoyer(form) {
  // Pot de miel + délai minimum de saisie : les robots remplissent tout, tout de suite
  if (champ(form, "site_web", 200)) return { ok: true };
  const ouvertA = Number(form.get("t")) || 0;
  if (Date.now() - ouvertA < 3000) throw new Erreur("Envoi trop rapide, réessayez.");

  const nom = champ(form, "nom", 100);
  const email = champ(form, "email", 150);
  const titre = champ(form, "titre", 150);
  const description = champ(form, "description", 4000);
  const priorite = champ(form, "priorite", 10);
  const lieuId = Number(form.get("lieu")) || null;
  const lieuLibre = champ(form, "lieu_libre", 150);

  if (!nom || !titre || !description) throw new Erreur("Nom, objet et description sont obligatoires.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Erreur("Adresse e-mail invalide.");

  const contact = email ? `${nom} - ${email}` : nom; // pas de <...> : Atlas les retire
  const lignes = [description, "", `Demandeur : ${contact}`];
  if (lieuLibre) lignes.push(`Lieu précisé : ${lieuLibre}`);

  const body = {
    title: titre,
    description: lignes.join("\n"),
    contact,
    priority: PRIORITES.has(priorite) ? priorite : "NONE",
  };
  if (lieuId && (await getLieux()).some((l) => l.id === lieuId)) body.location = { id: lieuId };

  const pj = form.get("pj");
  if (pj && typeof pj === "object" && pj.size > 0) {
    const fichier = await envoyerPj(pj);
    body.files = [{ id: fichier.id }];
    if (fichier.image) body.image = { id: fichier.id }; // affichée en vignette dans Atlas
  }

  const res = await atlas("/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Création refusée par Atlas (${res.status}) : ${await res.text()}`);
  const demande = await res.json();
  return { ok: true, numero: demande.customId };
}

class Erreur extends Error {} // erreur à afficher telle quelle à l'utilisateur

// ---- Serveur HTTP (nginx transmet /demande/...) ----
function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const route = url.pathname.replace(/^\/demande/, "").replace(/\/$/, "") || "/";
    try {
      if ((req.method === "GET" || req.method === "HEAD") && route === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(PAGE);
      }
      if (req.method === "GET" && route === "/lieux") {
        return json(res, 200, await getLieux());
      }
      if (req.method === "POST" && route === "/envoyer") {
        const ip = req.headers["x-real-ip"] || req.socket.remoteAddress;
        if (rateLimited(ip)) return json(res, 429, { erreur: "Trop de demandes envoyées. Réessayez plus tard." });
        const form = await new Request("http://localhost", {
          method: "POST",
          headers: req.headers,
          body: req,
          duplex: "half",
        }).formData();
        return json(res, 200, await envoyer(form));
      }
      json(res, 404, { erreur: "Introuvable" });
    } catch (e) {
      if (e instanceof Erreur) return json(res, 400, { erreur: e.message });
      console.error(e);
      json(res, 502, { erreur: "Le service de maintenance est indisponible. Réessayez plus tard." });
    }
  })
  .listen(PORT, () => console.log(`Formulaire de demande sur :${PORT}`));
