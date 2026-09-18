#!/usr/bin/env node
/**
 * Résolution des paquets du Magasin Windows par IDENTITÉ DE PAQUET.
 *
 * Ce n'est pas une recherche : on interroge le catalogue de Microsoft avec le PFN
 * que la machine détient déjà. Le même identifiant des deux côtés, donc aucune
 * ambiguïté possible et aucun faux positif concevable.
 *
 * C'est ainsi que « 4DF9E0F8.Netflix » devient « Netflix », « GIMP.43237F745459 »
 * devient « GIMP », et « BooStudioLLC.TorrexLite-TorrentDownloader » devient
 * « Torrex Lite - Torrent Downloader » — un titre où le mot « Torrent » apparaît
 * enfin, ce qui rend le produit classable.
 *
 * Usage : node scripts/resoudre-store.cjs <inventaire.json> <sortie.json>
 */

const fs = require('fs');

const CV = 'AAAAAAAAAAAAAAAA.1';
const BASE = 'https://displaycatalog.mp.microsoft.com/v7.0/products/lookup';
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

const DETAIL = 'https://displaycatalog.mp.microsoft.com/v7.0/products';

/**
 * La fiche détaillée porte la description écrite par l'éditeur.
 *
 * Deux pièges coûteux : le gabarit s'écrit `Details` avec une majuscule, et la
 * réponse arrive sous `Product` au SINGULIER — là où la résolution par identité
 * rend `Products`. Avec la mauvaise casse ou la mauvaise clé, le service répond
 * 200 et un corps vide, ce qui ressemble à une absence de données.
 */
async function detailler(productId) {
  const u = `${DETAIL}/${productId}?market=US&languages=en-us&fieldsTemplate=Details&MS-CV=${CV}`;
  const r = await fetch(u);
  if (!r.ok) return null;
  const j = await r.json();
  const p = j.Product || (j.Products || [])[0];
  if (!p) return null;
  const loc = (p.LocalizedProperties || [])[0] || {};
  const texte = String(loc.ProductDescription || loc.ShortDescription || '').replace(/\s+/g, ' ').trim();
  return {
    description: texte || null,
    editeur: loc.PublisherName || loc.DeveloperName || null,
    categories: (p.Properties && p.Properties.Category ? [p.Properties.Category] : []).filter(Boolean),
  };
}

async function resoudre(pfn) {
  const u = `${BASE}?alternateId=PackageFamilyName&value=${encodeURIComponent(pfn)}&market=US&languages=en-us&MS-CV=${CV}`;
  const r = await fetch(u);
  if (!r.ok) return { pfn, statut: 'HTTP_' + r.status };
  const j = await r.json();
  const p = (j.Products || [])[0];
  if (!p) return { pfn, statut: 'ABSENT' };
  const loc = (p.LocalizedProperties || [])[0] || {};
  if (!loc.ProductTitle) return { pfn, statut: 'SANS_TITRE' };

  let detail = null;
  if (p.ProductId) {
    await dodo(120);
    try { detail = await detailler(p.ProductId); } catch { detail = null; }
  }

  return {
    pfn,
    statut: 'RESOLU',
    productId: p.ProductId || null,
    titre: String(loc.ProductTitle).trim(),
    description: detail ? detail.description : null,
    editeur: detail ? detail.editeur : null,
    etiquettes: detail ? detail.categories : [],
    // Le PFN étant la clé des deux côtés, la preuve est décisive par construction.
    niveauPreuve: 'DECISIF',
  };
}

async function main() {
  const [fIn, fOut] = process.argv.slice(2);
  const inv = JSON.parse(fs.readFileSync(fIn, 'utf8'));
  const pfns = [...new Set(inv.map((x) => x.identitePaquet).filter(Boolean))];

  process.stderr.write(`paquets a resoudre : ${pfns.length}\n`);
  const resultats = [];
  let i = 0;
  for (const pfn of pfns) {
    i++;
    if (i % 25 === 0) process.stderr.write(`  ${i}/${pfns.length}\n`);
    try {
      resultats.push(await resoudre(pfn));
    } catch (e) {
      resultats.push({ pfn, statut: 'ERREUR', message: String(e.message).slice(0, 80) });
    }
    await dodo(120);
  }

  fs.writeFileSync(fOut, JSON.stringify(resultats, null, 2));
  const resolus = resultats.filter((r) => r.statut === 'RESOLU');
  console.log(`paquets interroges : ${resultats.length}`);
  console.log(`titres officiels obtenus : ${resolus.length}`);
  console.log(`sans reponse : ${resultats.length - resolus.length}`);
}

main();
