#!/usr/bin/env node
/**
 * Determination de la PROVENANCE d'une application, à partir des seules preuves
 * presentes sur la machine.
 *
 * Aucune requete reseau. Aucune API. Aucun nom d'application ecrit a l'avance.
 * Le programme ne « sait » rien : il lit ce que le disque porte et en deduit
 * par quel circuit l'application est arrivee.
 *
 * Les preuves viennent de `scripts/identite-locale.ps1`.
 *
 * Principe de classement : on ne conclut jamais sur un seul indice. Ce sont les
 * CONTRADICTIONS entre indices qui sont revelatrices — un binaire qui embarque la
 * bibliotheque d'une boutique sans etre enregistre dans cette boutique, par exemple,
 * n'est pas arrive par elle.
 *
 * Usage : node scripts/provenance.cjs <inventaire.json> [--detail]
 */

const fs = require('fs');

/** Niveaux de provenance, du plus atteste au moins atteste. */
const PROVENANCES = {
  STEAM_ENREGISTRE: 'Enregistre aupres de Steam (manifeste present)',
  MAGASIN_WINDOWS: 'Paquet du Magasin Windows (identite MSIX)',
  BOUTIQUE_EPIC: 'Boutique Epic (SDK Epic present)',
  BOUTIQUE_GOG: 'Boutique GOG (SDK Galaxy present)',
  EDITEUR_SIGNE: 'Installation directe, binaire signe et signature valide',
  EDITEUR_NON_SIGNE: 'Installation directe, binaire non signe',
  REPACKAGE: 'Embarque le SDK d une boutique SANS y etre enregistre',
  CONTOURNEMENT: 'Emulation de boutique detectee dans le dossier',
  INDETERMINE: 'Preuves insuffisantes',
};

const a = (x, k) => (x.preuves || {})[k];
const marqueurs = (x) => (x.preuves || {}).marqueurs || [];

/** Normalise pour comparer un editeur declare et un signataire de certificat. */
const noyau = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|gmbh|sa|sas|srl|co|company|software|studios?|games?|entertainment|interactive|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

function classe(x) {
  const m = marqueurs(x);
  const sig = a(x, 'signature');
  const signataire = a(x, 'signataire');
  const emplacement = String(x.emplacement || '').toLowerCase();

  const indices = [];

  // --- Circuits attestes par une identite de paquet ---
  if (x.steamAppId) {
    indices.push(`manifeste Steam ${x.steamAppId}`);
    return { provenance: 'STEAM_ENREGISTRE', confiance: 'CERTAINE', indices };
  }
  // Une identite de paquet MSIX est delivree par Windows lui-meme : c'est la
  // preuve de provenance la plus forte qui existe apres un manifeste de boutique.
  if (x.identitePaquet) {
    indices.push(`identite de paquet ${x.identitePaquet}`);
    return { provenance: 'MAGASIN_WINDOWS', confiance: 'CERTAINE', indices };
  }
  if (emplacement.includes('windowsapps')) {
    indices.push('installe sous WindowsApps');
    return { provenance: 'MAGASIN_WINDOWS', confiance: 'CERTAINE', indices };
  }

  // --- Contradiction : SDK de boutique sans enregistrement ---
  if (m.includes('EMULATEUR_STEAM')) {
    indices.push('fichier d emulation de client Steam dans le dossier');
    return { provenance: 'CONTOURNEMENT', confiance: 'FORTE', indices };
  }
  if (m.includes('STEAM_SDK') && !x.steamAppId) {
    indices.push('bibliotheque Steam presente mais aucun manifeste Steam');
    if (sig !== 'Valid') indices.push(`signature du binaire : ${sig}`);
    return { provenance: 'REPACKAGE', confiance: sig === 'Valid' ? 'MOYENNE' : 'FORTE', indices };
  }

  if (m.includes('EPIC_SDK')) {
    indices.push('SDK Epic present');
    return { provenance: 'BOUTIQUE_EPIC', confiance: 'MOYENNE', indices };
  }
  if (m.includes('GOG_SDK')) {
    indices.push('SDK GOG Galaxy present');
    return { provenance: 'BOUTIQUE_GOG', confiance: 'MOYENNE', indices };
  }

  // --- Installation directe ---
  if (sig === 'Valid') {
    indices.push('signature Authenticode valide');
    // Une discordance entre signataire et editeur declare est FREQUENTE et
    // legitime : sous-traitance de signature, filiale, editeur rachete. Mesure du
    // 2026-09-17 : cette seule regle accusait Git et l'Epic Games Launcher.
    // On la consigne comme observation, jamais comme conclusion.
    const declare = noyau(x.editeurDeclare || a(x, 'editeurBinaire'));
    const signe = noyau(signataire);
    if (declare && signe && !signe.includes(declare) && !declare.includes(signe)) {
      indices.push('signataire distinct de l editeur declare (courant et legitime)');
    }
    return { provenance: 'EDITEUR_SIGNE', confiance: 'FORTE', indices };
  }

  if (a(x, 'produitBinaire') || a(x, 'editeurBinaire')) {
    indices.push(`binaire non signe (${sig})`);
    if (a(x, 'produitBinaire')) indices.push('mais porte un ProductName');
    return { provenance: 'EDITEUR_NON_SIGNE', confiance: 'MOYENNE', indices };
  }

  return { provenance: 'INDETERMINE', confiance: 'NULLE', indices };
}

/** Nom le plus fiable disponible, par ordre de force de la preuve. */
function nomRetenu(x) {
  if (x.steamNom) return { nom: x.steamNom, source: 'manifeste Steam' };
  const p = a(x, 'produitBinaire');
  if (p && String(p).trim()) return { nom: String(p).trim(), source: 'ProductName du binaire' };
  const d = a(x, 'descriptionBinaire');
  if (d && String(d).trim()) return { nom: String(d).trim(), source: 'FileDescription du binaire' };
  if (x.nomRegistre) return { nom: x.nomRegistre, source: 'registre Windows' };
  return { nom: null, source: null };
}

function main() {
  const fichier = process.argv[2];
  const detail = process.argv.includes('--detail');
  if (!fichier) {
    console.error('Usage: node scripts/provenance.cjs <inventaire.json> [--detail]');
    process.exit(2);
  }

  const brut = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  // On ne garde que ce qui a un dossier reel : sans fichiers, aucune preuve.
  const entrees = brut.filter((x) => x.emplacement && (x.preuves || {}).nbFichiers > 0);

  const resultats = entrees.map((x) => {
    const c = classe(x);
    const n = nomRetenu(x);
    return { ...c, nom: n.nom, sourceDuNom: n.source, nomRegistre: x.nomRegistre, emplacement: x.emplacement, brut: x };
  });

  const parProvenance = {};
  for (const r of resultats) (parProvenance[r.provenance] ||= []).push(r);

  console.log('='.repeat(72));
  console.log('PROVENANCE DES APPLICATIONS — deduite de la machine seule');
  console.log('='.repeat(72));
  console.log(`entrees du registre inventoriees : ${brut.length}`);
  console.log(`dont avec un dossier analysable  : ${entrees.length}`);
  console.log('');

  const ordre = Object.keys(PROVENANCES);
  for (const p of ordre) {
    const l = parProvenance[p] || [];
    if (!l.length) continue;
    console.log(`  ${String(l.length).padStart(4)}  ${p.padEnd(20)} ${PROVENANCES[p]}`);
  }

  // --- Ce qui ne colle pas : la partie interessante ---
  //
  // Un binaire SIGNE qui embarque le SDK d'une boutique est le cas NORMAL d'un
  // client de boutique ou d'un jeu vendu sur plusieurs plateformes. Seule l'absence
  // de signature transforme l'indice en anomalie. Mesure du 2026-09-17 : sans cette
  // separation, Steam lui-meme, Ubisoft Connect et le Rockstar Games Launcher
  // etaient signales comme suspects.
  const tous = [...(parProvenance.CONTOURNEMENT || []), ...(parProvenance.REPACKAGE || [])];
  const suspects = tous.filter((r) => r.confiance === 'FORTE');
  const aExaminer = tous.filter((r) => r.confiance !== 'FORTE');

  if (aExaminer.length) {
    console.log(`\n--- ${aExaminer.length} cas signes, donc explicables : simple observation ---`);
    for (const r of aExaminer) {
      console.log(`  ${String(r.nom || r.nomRegistre).slice(0, 42).padEnd(42)} | ${r.indices[0]}`);
    }
  }

  if (suspects.length) {
    console.log('\n' + '='.repeat(72));
    console.log('ANOMALIES — contradiction NON expliquee par une signature');
    console.log('='.repeat(72));
    for (const s of suspects) {
      console.log(`\n  [${s.provenance} · confiance ${s.confiance}]`);
      console.log(`  nom retenu      : ${s.nom || '(aucun)'}   <- ${s.sourceDuNom || 'aucune source'}`);
      console.log(`  nom au registre : ${s.nomRegistre || '(absent du registre)'}`);
      console.log(`  editeur binaire : ${a(s.brut, 'editeurBinaire') || '(aucun)'}`);
      console.log(`  signature       : ${a(s.brut, 'signature')}`);
      for (const i of s.indices) console.log(`     · ${i}`);
    }
  }

  if (detail) {
    console.log('\n' + '='.repeat(72));
    console.log('DETAIL COMPLET');
    console.log('='.repeat(72));
    for (const p of ordre) {
      const l = parProvenance[p] || [];
      if (!l.length) continue;
      console.log(`\n### ${p} (${l.length})`);
      for (const r of l.sort((x, y) => String(x.nom).localeCompare(String(y.nom)))) {
        console.log(`  ${String(r.nom || r.nomRegistre || '?').slice(0, 44).padEnd(44)} | ${r.sourceDuNom || ''}`);
      }
    }
  }

  const fiables = resultats.filter((r) => r.confiance === 'CERTAINE' || r.confiance === 'FORTE').length;
  console.log('\n' + '='.repeat(72));
  console.log(`provenance etablie avec certitude ou forte confiance : ${fiables} / ${entrees.length}`);
  console.log(`nom obtenu sans aucune source externe                : ${resultats.filter((r) => r.nom).length} / ${entrees.length}`);
  console.log('='.repeat(72));
}

main();
