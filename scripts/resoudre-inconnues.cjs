#!/usr/bin/env node
/**
 * Dernière étape de la chaîne : chercher un candidat pour chaque application encore
 * inconnue, puis ne retenir que ceux qui résistent à la vérification.
 *
 *   candidats  ->  index de paquets winget (un annuaire, pas un modèle)
 *   verdict    ->  confrontation aux faits inscrits dans le binaire
 *
 * Trois raffinements par rapport à la première tentative, chacun visant un échec
 * observé le 2026-09-17 :
 *   1. on interroge aussi avec l'ÉDITEUR — « Incredibuild » seul était ambigu ;
 *   2. on interroge aussi avec le NOM D'EXÉCUTABLE, bien plus discriminant qu'un
 *      nom commercial : « Visual Studio » rendait trois produits indistinguables ;
 *   3. l'ambiguïté vaut refus — plusieurs candidats concordants, aucun retenu.
 *
 * Usage : node scripts/resoudre-inconnues.cjs <catalogue.json> <inventaire.json> <sortie.json>
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MOJIBAKE = /[�]|r Windowsr|r Visual/;

function winget(args) {
  try {
    return execFileSync('winget', [...args, '--accept-source-agreements', '--disable-interactivity'], {
      encoding: 'utf8', timeout: 25000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function lireRecherche(texte) {
  const lignes = String(texte).split(/\r?\n/);
  const i = lignes.findIndex((l) => /^Name\s+Id\s/.test(l));
  if (i < 0) return [];
  const enTete = lignes[i];
  const posId = enTete.indexOf('Id');
  const posVersion = enTete.indexOf('Version');
  const out = [];
  for (const l of lignes.slice(i + 1)) {
    if (!l.trim() || /^-+$/.test(l.trim()) || l.length <= posId) continue;
    const nom = l.slice(0, posId).trim();
    const reste = l.slice(posId);
    const id = reste.slice(0, posVersion > posId ? posVersion - posId : reste.length).trim();
    if (!nom || !id || id.includes(' ')) continue;
    out.push({ nom, id });
  }
  return out;
}

function lireFiche(texte) {
  const champ = (n) => {
    const m = String(texte).match(new RegExp('^' + n + ':\\s*(.+)$', 'm'));
    return m ? m[1].trim() : null;
  };
  const d = String(texte).match(/^Description:\s*([\s\S]*?)(?=\n[A-Z][a-zA-Z ]*:|\n\s*$)/m);
  const t = String(texte).match(/^Tags:\s*([\s\S]*?)(?=\n[A-Z][a-zA-Z ]*:|\n\s*$)/m);
  return {
    editeur: champ('Publisher') || champ('Author'),
    version: champ('Version'),
    description: d ? d[1].replace(/\s+/g, ' ').trim() : null,
    etiquettes: t ? t[1].split(/\s+/).filter(Boolean) : [],
  };
}

/** Les requêtes à tenter, de la plus discriminante à la plus large. */
function requetes(nom, editeur, exeName) {
  const propre = String(nom).replace(/\([^)]*\)/g, ' ').replace(/\b\d+(\.\d+)+[\w.-]*\b/g, ' ')
    .replace(/\b(x64|x86|64-bit|32-bit)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const base = String(exeName || '').replace(/\.exe$/i, '');
  const out = [];
  if (base.length >= 4) out.push(base);              // le plus discriminant
  if (propre.length >= 2) out.push(propre);
  if (propre && editeur) out.push(`${propre} ${String(editeur).split(/[\s,]+/)[0]}`);
  return [...new Set(out)];
}

const noyauEditeur = (s) => String(s || '').toLowerCase()
  .replace(/\b(inc|llc|ltd|limited|corp|corporation|company|co|gmbh|sa|sas|srl|bv|ab|oy|as|plc|pbc|foundation|project|team|studios?|software|technologies|technology|labs?|group|the)\b/g, '')
  .replace(/\.(com|org|net|io|ai|dev|app)\b/g, '').replace(/[^a-z0-9]/g, '');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Reprise de la règle du vérificateur : une décisive, ou deux fortes, sans contradiction. */
function verifier(local, candidat) {
  const preuves = [];
  const contradictions = [];
  let fortes = 0;

  const eL = noyauEditeur(local.editeur);
  const eC = noyauEditeur(candidat.editeur);
  if (eL && eC) {
    if (eL === eC || eL.includes(eC) || eC.includes(eL)) { preuves.push(`même éditeur « ${local.editeur} »`); fortes++; }
    else contradictions.push(`éditeurs incompatibles : « ${local.editeur} » contre « ${candidat.editeur} »`);
  }

  const v = (s) => (String(s || '').match(/\d+/g) || []).slice(0, 2).join('.');
  if (local.version && candidat.version) {
    if (v(local.version) && v(local.version) === v(candidat.version)) { preuves.push(`même version ${local.version}`); fortes++; }
    else contradictions.push(`versions différentes : ${local.version} contre ${candidat.version}`);
  }

  const exe = String(local.exeName || '').toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '');
  if (exe.length >= 4 && (norm(candidat.nom) + norm(candidat.description)).includes(exe)) {
    preuves.push(`nom d'exécutable « ${local.exeName} » retrouvé`); fortes++;
  }

  const nL = norm(String(local.nom).replace(/\([^)]*\)/g, ' ').replace(/\b\d+(\.\d+)+[\w.-]*\b/g, ' '));
  const nC = norm(String(candidat.nom).replace(/\([^)]*\)/g, ' ').replace(/\b\d+(\.\d+)+[\w.-]*\b/g, ' '));
  if (nL.length >= 4 && nL === nC) { preuves.push(`nom strictement identique « ${candidat.nom} »`); fortes++; }

  return { accepte: contradictions.length === 0 && fortes >= 2, preuves, contradictions };
}

function main() {
  const [fCat, fInv, fOut] = process.argv.slice(2);
  const fiches = JSON.parse(fs.readFileSync(fCat, 'utf8'));
  const inventaire = JSON.parse(fs.readFileSync(fInv, 'utf8'));

  const parEmplacement = new Map();
  for (const e of inventaire) {
    if (e.emplacement) parEmplacement.set(String(e.emplacement).toLowerCase().replace(/\\+$/, ''), e);
  }

  const inconnues = fiches.filter((f) => f.classement.niveau === 'INCONNU' && f.nom);
  process.stderr.write(`inconnues a resoudre : ${inconnues.length}\n`);

  const resultats = [];
  let i = 0;
  for (const f of inconnues) {
    i++;
    const inv = parEmplacement.get(String(f.emplacement || '').toLowerCase().replace(/\\+$/, '')) || {};
    const local = {
      nom: MOJIBAKE.test(f.nom) && inv.nomRegistre ? inv.nomRegistre : f.nom,
      editeur: f.editeur,
      version: inv.version || null,
      exeName: (inv.preuves || {}).exeAnalyse ? path.basename(inv.preuves.exeAnalyse) : null,
    };
    process.stderr.write(`[${i}/${inconnues.length}] ${local.nom}\n`);

    let retenu = null;
    let raison = 'aucun candidat';
    for (const q of requetes(local.nom, local.editeur, local.exeName)) {
      const trouves = lireRecherche(winget(['search', q])).slice(0, 4);
      if (!trouves.length) continue;
      const juges = trouves.map((t) => {
        const fiche = lireFiche(winget(['show', '--id', t.id, '--exact']));
        return { candidat: { id: t.id, nom: t.nom, ...fiche }, verdict: verifier(local, { nom: t.nom, ...fiche }) };
      });
      const acceptes = juges.filter((j) => j.verdict.accepte);
      if (acceptes.length === 1) { retenu = acceptes[0]; raison = 'verifie'; break; }

      if (acceptes.length > 1) {
        // Un depot contient souvent des VARIANTES d'un meme produit :
        // « 7-Zip, 7-Zip ZS, Dark7zip » ou « PyCharm, PyCharm Community Edition ».
        // L'ambiguite reste un refus, SAUF si exactement un candidat porte le nom
        // strictement identique — l'identite exacte l'emporte sur les derives.
        const nomLocal = norm(String(local.nom).replace(/\([^)]*\)/g, ' ').replace(/\b\d+(\.\d+)+[\w.-]*\b/g, ' '));
        const exacts = acceptes.filter((a) => norm(a.candidat.nom) === nomLocal);
        if (exacts.length === 1) { retenu = exacts[0]; raison = 'verifie (nom exact parmi des variantes)'; break; }
        raison = `ambigu : ${acceptes.map((a) => a.candidat.nom).join(', ')}`;
        continue;
      }
      raison = `rejete : ${juges.map((j) => j.candidat.nom).join(', ')}`;
    }

    resultats.push({
      nom: f.nom,
      emplacement: f.emplacement,
      local,
      retenu: retenu ? retenu.candidat : null,
      preuves: retenu ? retenu.verdict.preuves : [],
      raison,
    });
  }

  // Chaque passe ne traite que les inconnues DU MOMENT. Ecraser le fichier perdait
  // les resolutions des passes precedentes : une application confirmee au tour N
  // redevenait inconnue au tour N+1. On fusionne donc sur l'emplacement.
  let anciennes = [];
  if (fs.existsSync(fOut)) {
    try { anciennes = JSON.parse(fs.readFileSync(fOut, 'utf8')); } catch { anciennes = []; }
  }
  const parCle = new Map();
  for (const a of anciennes) if (a && a.retenu) parCle.set(String(a.emplacement || '').toLowerCase(), a);
  for (const n of resultats) {
    const k = String(n.emplacement || '').toLowerCase();
    // Une nouvelle confirmation remplace l'ancienne ; un echec ne l'efface pas.
    if (n.retenu || !parCle.has(k)) parCle.set(k, n);
  }
  const fusionnees = [...parCle.values()];

  fs.writeFileSync(fOut, JSON.stringify(fusionnees, null, 2));
  console.log(`conservees des passes precedentes : ${fusionnees.filter((x) => x.retenu).length - resultats.filter((x) => x.retenu).length}`);
  const ok = resultats.filter((r) => r.retenu);
  console.log(`\ninconnues traitees : ${resultats.length}`);
  console.log(`CONFIRMEES         : ${ok.length}`);
  for (const r of ok) console.log(`   ${String(r.nom).slice(0, 26).padEnd(26)} -> ${r.retenu.id}  [${r.preuves.join(' + ')}]`);
}

main();
