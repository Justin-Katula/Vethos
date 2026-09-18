#!/usr/bin/env node
/**
 * Récupère les DESCRIPTIONS officielles des paquets déjà identifiés.
 *
 * Aucune recherche : on interroge par identifiant canonique, celui que `winget list`
 * a déjà établi en comparant l'installation au dépôt. La description est écrite par
 * l'éditeur du logiciel.
 *
 * Elle servira à classer les applications qui ne déclarent ni type de fichier ni
 * protocole — PyCharm, Node.js, qBittorrent, OBS Studio.
 *
 * Usage : node scripts/descriptions-winget.cjs <winget-ids.json> <sortie.json>
 */

const { execFileSync } = require('child_process');
const fs = require('fs');

function winget(args) {
  try {
    return execFileSync('winget', [...args, '--accept-source-agreements', '--disable-interactivity'], {
      encoding: 'utf8', timeout: 25000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function lireFiche(texte) {
  const champ = (nom) => {
    const m = String(texte).match(new RegExp('^' + nom + ':\\s*(.+)$', 'm'));
    return m ? m[1].trim() : null;
  };
  const desc = String(texte).match(/^Description:\s*([\s\S]*?)(?=\n[A-Z][a-zA-Z ]*:|\n\s*$)/m);
  const tags = String(texte).match(/^Tags:\s*([\s\S]*?)(?=\n[A-Z][a-zA-Z ]*:|\n\s*$)/m);
  return {
    editeur: champ('Publisher') || champ('Author'),
    version: champ('Version'),
    description: desc ? desc[1].replace(/\s+/g, ' ').trim() : null,
    // Les etiquettes sont redigees par l'editeur et souvent plus nettes que la prose.
    etiquettes: tags ? tags[1].split(/\s+/).map((t) => t.trim()).filter(Boolean) : [],
  };
}

function main() {
  const [fIn, fOut] = process.argv.slice(2);
  const ids = [...new Set(
    JSON.parse(fs.readFileSync(fIn, 'utf8'))
      .filter((w) => w.forme === 'CANONIQUE')
      .map((w) => w.id),
  )];

  process.stderr.write(`identifiants a interroger : ${ids.length}\n`);
  const out = [];
  let i = 0;
  for (const id of ids) {
    i++;
    if (i % 20 === 0) process.stderr.write(`  ${i}/${ids.length}\n`);
    const fiche = lireFiche(winget(['show', '--id', id, '--exact']));
    out.push({ id, ...fiche });
  }

  fs.writeFileSync(fOut, JSON.stringify(out, null, 2));
  const avecDesc = out.filter((o) => o.description).length;
  console.log(`interroges      : ${out.length}`);
  console.log(`avec description : ${avecDesc}`);
  console.log(`avec etiquettes  : ${out.filter((o) => o.etiquettes.length).length}`);
}

main();
