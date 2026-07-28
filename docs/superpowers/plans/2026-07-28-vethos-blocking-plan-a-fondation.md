# Plan A — Fondation du pont natif de blocage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le pont natif unique entre Vethos et Windows — un sidecar C++ qui énumère les fenêtres et sait défaire tout ce qu'il a fait — plus la logique pure TypeScript qui décide quelle fenêtre est une cible valide et où placer un overlay.

**Architecture:** Un exécutable C++ sans dépendance (`vethos-probe.exe`) communique avec le processus principal Electron en JSONL sur stdin/stdout. Le sidecar émet des attributs bruts de fenêtres ; c'est le TypeScript pur qui décide. Le sidecar tient un journal d'annulation en mémoire et surveille la mort du parent ; le processus principal double cette garantie par un journal sur disque rejoué au démarrage.

**Tech Stack:** C++20 / MSVC (Win32 + COM), Node 20 / Electron 30, TypeScript strict, vitest.

**Spec de référence :** `docs/superpowers/specs/2026-07-28-vethos-blocking-design.md`

## Global Constraints

- **Un seul pont natif** pour tout le Point 1. Ne jamais créer un second mécanisme natif.
- **Jamais `SW_HIDE` sur une fenêtre cible.** Aucune exception.
- **Jamais `TerminateProcess`** sur un processus cible.
- **Jamais `SetParent`** entre processus — uniquement l'ownership (`GWLP_HWNDPARENT`).
- **Jamais `alwaysOnTop`** sur un overlay.
- `HWND` et `processCreatedAt` (FILETIME) sont transportés en **chaînes décimales**, jamais en nombres JSON : ils dépassent la précision entière de JavaScript (2^53).
- Le sidecar est lancé avec `windowsHide: true` — jamais via un shell (bug 3).
- Compilation `/MT` (CRT statique) : aucun redistribuable Visual C++ requis.
- TypeScript strict avec `noUncheckedIndexedAccess` : tout accès indexé renvoie `T | undefined` et doit être gardé.
- Toute logique pure a son fichier `*.test.ts` voisin.
- Aucune référence aux tâches, objectifs ou score de priorité.
- Messages destinés à l'utilisateur en français.

## Arborescence produite par ce plan

```
native/vethos-probe/
  src/json.h            déclarations du codec JSON minimal
  src/json.cpp          implémentation du codec
  src/win_windows.h     déclarations de l'énumération de fenêtres
  src/win_windows.cpp   énumération, attributs, bounds DWM, élévation
  src/undo_log.h        déclarations du journal d'annulation
  src/undo_log.cpp      capture et rejeu de l'état d'origine
  src/main.cpp          boucle JSONL, dispatch, death-watch
  test/test_json.cpp    test du codec JSON (assertions, sans framework)

scripts/build-sidecar.mjs   localise MSVC, compile, place le binaire

src/main/blocking/
  protocol.ts           encodage et décodage JSONL     (pur)
  protocol.test.ts
  window-filter.ts      prédicat de fenêtre cible       (pur)
  window-filter.test.ts
  geometry.ts           placement de l'overlay          (pur)
  geometry.test.ts
  journal.ts            journal de restauration disque  (pur)
  journal.test.ts
  sidecar-bridge.ts     spawn, JSONL, cycle de vie

scripts/sidecar-smoke.mjs   preuve réelle bout en bout
```

---

### Task 1 : Codec JSON du sidecar

Le protocole a besoin d'un encodeur et d'un décodeur JSON en C++. On l'écrit à la main plutôt que d'ajouter une dépendance — la décision « zéro dépendance » du §3.1 de la spec. C'est la seule logique C++ réellement pure, donc la seule testable en isolation : elle a son propre exécutable de test.

**Files:**
- Create: `native/vethos-probe/src/json.h`
- Create: `native/vethos-probe/src/json.cpp`
- Create: `native/vethos-probe/test/test_json.cpp`
- Create: `scripts/build-sidecar.mjs`
- Modify: `package.json` (ajout de deux scripts)

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: `vethos::JsonValue`, `vethos::parseJson(const std::string&, JsonValue&) -> bool`, `vethos::JsonOut` (constructeur d'objet JSON), `vethos::jsonEscape(const std::string&) -> std::string`. Utilisés par toutes les tâches C++ suivantes.

- [ ] **Step 1 : Écrire l'en-tête du codec**

Créer `native/vethos-probe/src/json.h` :

```cpp
#pragma once

#include <map>
#include <string>
#include <vector>

namespace vethos {

enum class JsonType { Null, Bool, Number, String, Array, Object };

struct JsonValue {
  JsonType type = JsonType::Null;
  bool boolean = false;
  double number = 0.0;
  std::string str;
  std::vector<JsonValue> array;
  std::map<std::string, JsonValue> object;

  // Renvoie nullptr si la clef est absente ou si this n'est pas un objet.
  const JsonValue* find(const std::string& key) const;

  std::string stringOr(const std::string& key, const std::string& fallback) const;
  double numberOr(const std::string& key, double fallback) const;
  bool boolOr(const std::string& key, bool fallback) const;
  std::vector<std::string> stringArray(const std::string& key) const;
};

// Analyse un document JSON complet. Renvoie false si le texte est invalide ou
// s'il reste autre chose que des blancs après la valeur analysee.
bool parseJson(const std::string& text, JsonValue& out);

std::string jsonEscape(const std::string& raw);

// Constructeur d'objet JSON plat ou imbrique. Emet toujours un objet.
class JsonOut {
 public:
  JsonOut& str(const char* key, const std::string& value);
  JsonOut& num(const char* key, double value);
  JsonOut& boolean(const char* key, bool value);
  // Insere du JSON deja serialise : objets imbriques, tableaux.
  JsonOut& raw(const char* key, const std::string& serialized);
  std::string done() const;

 private:
  void separate();
  std::string buf_;
};

// Serialise un tableau de chaines, pour JsonOut::raw.
std::string jsonStringArray(const std::vector<std::string>& items);

}  // namespace vethos
```

- [ ] **Step 2 : Écrire le test avant l'implémentation**

Créer `native/vethos-probe/test/test_json.cpp` :

```cpp
#include "../src/json.h"

#include <cstdio>
#include <cstdlib>
#include <string>

static int g_failures = 0;

static void check(bool condition, const char* label) {
  if (condition) {
    std::printf("  ok   %s\n", label);
  } else {
    std::printf("  FAIL %s\n", label);
    ++g_failures;
  }
}

static void testParsesFlatObject() {
  vethos::JsonValue v;
  check(vethos::parseJson(R"({"id":7,"cmd":"ping","on":true})", v), "objet plat analyse");
  check(v.type == vethos::JsonType::Object, "type objet");
  check(v.numberOr("id", -1) == 7, "nombre lu");
  check(v.stringOr("cmd", "") == "ping", "chaine lue");
  check(v.boolOr("on", false), "booleen lu");
  check(v.stringOr("absent", "defaut") == "defaut", "valeur par defaut sur clef absente");
}

static void testParsesStringArray() {
  vethos::JsonValue v;
  check(vethos::parseJson(R"({"exeNames":["a.exe","b.exe"]})", v), "tableau analyse");
  const std::vector<std::string> names = v.stringArray("exeNames");
  check(names.size() == 2, "deux entrees");
  check(names.size() == 2 && names[0] == "a.exe", "premiere entree");
  check(names.size() == 2 && names[1] == "b.exe", "seconde entree");
}

static void testParsesNestedObject() {
  vethos::JsonValue v;
  check(vethos::parseJson(R"({"bounds":{"left":10,"top":-20}})", v), "objet imbrique analyse");
  const vethos::JsonValue* bounds = v.find("bounds");
  check(bounds != nullptr, "objet imbrique trouve");
  check(bounds != nullptr && bounds->numberOr("left", 0) == 10, "champ imbrique positif");
  check(bounds != nullptr && bounds->numberOr("top", 0) == -20, "champ imbrique negatif");
}

static void testParsesEscapes() {
  vethos::JsonValue v;
  check(vethos::parseJson(R"({"title":"a\"b\\c\nd"})", v), "echappements analyses");
  check(v.stringOr("title", "") == "a\"b\\c\nd", "echappements decodes");
}

static void testRejectsInvalid() {
  vethos::JsonValue v;
  check(!vethos::parseJson("{\"a\":}", v), "valeur manquante rejetee");
  check(!vethos::parseJson("{\"a\":1", v), "accolade non fermee rejetee");
  check(!vethos::parseJson("", v), "chaine vide rejetee");
  check(!vethos::parseJson("{\"a\":1} parasite", v), "residu apres la valeur rejete");
}

static void testEscapesOutput() {
  check(vethos::jsonEscape("a\"b") == "a\\\"b", "guillemet echappe");
  check(vethos::jsonEscape("a\\b") == "a\\\\b", "antislash echappe");
  check(vethos::jsonEscape("a\nb") == "a\\nb", "saut de ligne echappe");
  // Un caractere de controle brut casserait une ligne JSONL.
  check(vethos::jsonEscape(std::string(1, '\x01')) == "\\u0001", "controle echappe en \\u");
}

static void testWritesObject() {
  const std::string out = vethos::JsonOut()
                              .str("event", "window-gone")
                              .str("hwnd", "72382")
                              .num("pid", 4242)
                              .boolean("elevated", false)
                              .done();
  check(out == R"({"event":"window-gone","hwnd":"72382","pid":4242,"elevated":false})",
        "objet serialise");
}

static void testRoundTrip() {
  const std::string encoded = vethos::JsonOut()
                                  .str("cmd", "watch")
                                  .raw("exeNames", vethos::jsonStringArray({"blender.exe"}))
                                  .done();
  vethos::JsonValue v;
  check(vethos::parseJson(encoded, v), "aller-retour analysable");
  check(v.stringOr("cmd", "") == "watch", "aller-retour commande");
  const std::vector<std::string> names = v.stringArray("exeNames");
  check(names.size() == 1 && names[0] == "blender.exe", "aller-retour tableau");
}

int main() {
  std::printf("test_json\n");
  testParsesFlatObject();
  testParsesStringArray();
  testParsesNestedObject();
  testParsesEscapes();
  testRejectsInvalid();
  testEscapesOutput();
  testWritesObject();
  testRoundTrip();
  std::printf(g_failures == 0 ? "TOUS VERTS\n" : "%d ECHEC(S)\n", g_failures);
  return g_failures == 0 ? 0 : 1;
}
```

- [ ] **Step 3 : Écrire le script de compilation**

Créer `scripts/build-sidecar.mjs`. Il localise MSVC via `vswhere.exe` (chemin fixe garanti par l'installeur Visual Studio) plutôt que de coder en dur une version.

```js
// Compile le sidecar natif vethos-probe.
//
// Localise Visual Studio via vswhere.exe, dont le chemin est garanti fixe par
// l'installeur, puis appelle cl.exe dans un environnement vcvars64.
//
//   node scripts/build-sidecar.mjs          compile le sidecar
//   node scripts/build-sidecar.mjs --test   compile et execute le test du codec
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NATIVE = join(ROOT, 'native', 'vethos-probe')
const OUT_DIR = join(ROOT, 'resources', 'sidecar')
const OBJ_DIR = join(NATIVE, 'obj')

const WITH_TEST = process.argv.includes('--test')

function findVcVars() {
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const vswhere = join(programFilesX86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  if (!existsSync(vswhere)) {
    throw new Error(
      `vswhere introuvable a ${vswhere}.\n` +
        'Installe la charge de travail "Developpement Desktop en C++" de Visual Studio.',
    )
  }
  const installPath = execFileSync(
    vswhere,
    [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ],
    { encoding: 'utf8' },
  ).trim()
  if (!installPath) {
    throw new Error('Aucune installation Visual Studio avec les outils C++ x64.')
  }
  const vcvars = join(installPath, 'VC', 'Auxiliary', 'Build', 'vcvars64.bat')
  if (!existsSync(vcvars)) throw new Error(`vcvars64.bat introuvable a ${vcvars}.`)
  return vcvars
}

// /MT lie le CRT statiquement : le binaire ne depend d'aucun redistribuable.
const COMMON_FLAGS = '/nologo /std:c++20 /EHsc /W4 /O2 /MT /DUNICODE /D_UNICODE'
const LIBS = 'user32.lib ole32.lib oleaut32.lib dwmapi.lib shell32.lib advapi32.lib'

function run(vcvars, commands) {
  const batPath = join(NATIVE, '.build.bat')
  const script = ['@echo off', `call "${vcvars}" >nul 2>&1`, `cd /d "${NATIVE}"`, ...commands].join(
    '\r\n',
  )
  writeFileSync(batPath, `${script}\r\n`, 'utf8')
  try {
    execSync(`"${batPath}"`, { stdio: 'inherit', windowsHide: true })
  } finally {
    rmSync(batPath, { force: true })
  }
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('Le sidecar est specifique a Windows.')
  }
  const vcvars = findVcVars()
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(OBJ_DIR, { recursive: true })

  const commands = []
  if (WITH_TEST) {
    commands.push(
      `cl ${COMMON_FLAGS} /Fo"obj\\test_" test\\test_json.cpp src\\json.cpp ` +
        `/Fe"obj\\test_json.exe" || exit /b 1`,
      'obj\\test_json.exe || exit /b 1',
    )
  }
  commands.push(
    `cl ${COMMON_FLAGS} /Fo"obj\\" src\\json.cpp src\\win_windows.cpp src\\undo_log.cpp ` +
      `src\\main.cpp /Fe"${join(OUT_DIR, 'vethos-probe.exe')}" /link ${LIBS} || exit /b 1`,
  )
  run(vcvars, commands)
  console.log(`sidecar compile -> ${join(OUT_DIR, 'vethos-probe.exe')}`)
}

main()
```

Ajouter à `package.json`, dans `scripts`, juste après `"build:portable"` :

```json
    "build:sidecar": "node scripts/build-sidecar.mjs",
    "test:sidecar": "node scripts/build-sidecar.mjs --test",
```

> Note : à cette étape `win_windows.cpp`, `undo_log.cpp` et `main.cpp` n'existent pas encore. Le script complet est écrit maintenant pour ne pas y revenir ; seule la cible `--test` est utilisable avant la Task 2. C'est voulu.

- [ ] **Step 4 : Lancer le test pour vérifier qu'il échoue**

```bash
npm run test:sidecar
```

Attendu : ÉCHEC de compilation — `json.cpp` n'existe pas, `cl` renvoie
`LNK1181: cannot open input file 'src\json.cpp'` ou `C1083`.

- [ ] **Step 5 : Implémenter le codec**

Créer `native/vethos-probe/src/json.cpp` :

```cpp
#include "json.h"

#include <cstdio>
#include <cstdlib>

namespace vethos {
namespace {

struct Parser {
  const std::string& s;
  size_t i = 0;

  explicit Parser(const std::string& text) : s(text) {}

  void skipWhitespace() {
    while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r' || s[i] == '\n')) ++i;
  }

  bool literal(const char* text) {
    const size_t n = std::char_traits<char>::length(text);
    if (s.compare(i, n, text) != 0) return false;
    i += n;
    return true;
  }

  bool parseString(std::string& out) {
    if (i >= s.size() || s[i] != '"') return false;
    ++i;
    out.clear();
    while (i < s.size()) {
      const char c = s[i];
      if (c == '"') {
        ++i;
        return true;
      }
      if (c == '\\') {
        ++i;
        if (i >= s.size()) return false;
        const char esc = s[i++];
        switch (esc) {
          case '"': out.push_back('"'); break;
          case '\\': out.push_back('\\'); break;
          case '/': out.push_back('/'); break;
          case 'b': out.push_back('\b'); break;
          case 'f': out.push_back('\f'); break;
          case 'n': out.push_back('\n'); break;
          case 'r': out.push_back('\r'); break;
          case 't': out.push_back('\t'); break;
          case 'u': {
            if (i + 4 > s.size()) return false;
            const std::string hex = s.substr(i, 4);
            i += 4;
            const unsigned code = static_cast<unsigned>(std::strtoul(hex.c_str(), nullptr, 16));
            // Encodage UTF-8. Les paires de substitution sont laissees telles
            // quelles : le protocole n'echange que des titres deja en UTF-8.
            if (code < 0x80) {
              out.push_back(static_cast<char>(code));
            } else if (code < 0x800) {
              out.push_back(static_cast<char>(0xC0 | (code >> 6)));
              out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
            } else {
              out.push_back(static_cast<char>(0xE0 | (code >> 12)));
              out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
              out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
            }
            break;
          }
          default: return false;
        }
        continue;
      }
      out.push_back(c);
      ++i;
    }
    return false;  // guillemet fermant absent
  }

  bool parseNumber(double& out) {
    const size_t start = i;
    if (i < s.size() && (s[i] == '-' || s[i] == '+')) ++i;
    bool digits = false;
    while (i < s.size() && s[i] >= '0' && s[i] <= '9') {
      ++i;
      digits = true;
    }
    if (i < s.size() && s[i] == '.') {
      ++i;
      while (i < s.size() && s[i] >= '0' && s[i] <= '9') {
        ++i;
        digits = true;
      }
    }
    if (i < s.size() && (s[i] == 'e' || s[i] == 'E')) {
      ++i;
      if (i < s.size() && (s[i] == '-' || s[i] == '+')) ++i;
      while (i < s.size() && s[i] >= '0' && s[i] <= '9') ++i;
    }
    if (!digits) return false;
    out = std::strtod(s.substr(start, i - start).c_str(), nullptr);
    return true;
  }

  bool parseValue(JsonValue& out) {
    skipWhitespace();
    if (i >= s.size()) return false;
    const char c = s[i];

    if (c == '"') {
      out.type = JsonType::String;
      return parseString(out.str);
    }
    if (c == '{') {
      ++i;
      out.type = JsonType::Object;
      skipWhitespace();
      if (i < s.size() && s[i] == '}') {
        ++i;
        return true;
      }
      while (true) {
        skipWhitespace();
        std::string key;
        if (!parseString(key)) return false;
        skipWhitespace();
        if (i >= s.size() || s[i] != ':') return false;
        ++i;
        JsonValue child;
        if (!parseValue(child)) return false;
        out.object[key] = child;
        skipWhitespace();
        if (i < s.size() && s[i] == ',') {
          ++i;
          continue;
        }
        if (i < s.size() && s[i] == '}') {
          ++i;
          return true;
        }
        return false;
      }
    }
    if (c == '[') {
      ++i;
      out.type = JsonType::Array;
      skipWhitespace();
      if (i < s.size() && s[i] == ']') {
        ++i;
        return true;
      }
      while (true) {
        JsonValue child;
        if (!parseValue(child)) return false;
        out.array.push_back(child);
        skipWhitespace();
        if (i < s.size() && s[i] == ',') {
          ++i;
          continue;
        }
        if (i < s.size() && s[i] == ']') {
          ++i;
          return true;
        }
        return false;
      }
    }
    if (literal("true")) {
      out.type = JsonType::Bool;
      out.boolean = true;
      return true;
    }
    if (literal("false")) {
      out.type = JsonType::Bool;
      out.boolean = false;
      return true;
    }
    if (literal("null")) {
      out.type = JsonType::Null;
      return true;
    }
    out.type = JsonType::Number;
    return parseNumber(out.number);
  }
};

}  // namespace

const JsonValue* JsonValue::find(const std::string& key) const {
  if (type != JsonType::Object) return nullptr;
  const auto it = object.find(key);
  return it == object.end() ? nullptr : &it->second;
}

std::string JsonValue::stringOr(const std::string& key, const std::string& fallback) const {
  const JsonValue* v = find(key);
  return (v != nullptr && v->type == JsonType::String) ? v->str : fallback;
}

double JsonValue::numberOr(const std::string& key, double fallback) const {
  const JsonValue* v = find(key);
  return (v != nullptr && v->type == JsonType::Number) ? v->number : fallback;
}

bool JsonValue::boolOr(const std::string& key, bool fallback) const {
  const JsonValue* v = find(key);
  return (v != nullptr && v->type == JsonType::Bool) ? v->boolean : fallback;
}

std::vector<std::string> JsonValue::stringArray(const std::string& key) const {
  std::vector<std::string> out;
  const JsonValue* v = find(key);
  if (v == nullptr || v->type != JsonType::Array) return out;
  for (const JsonValue& item : v->array) {
    if (item.type == JsonType::String) out.push_back(item.str);
  }
  return out;
}

bool parseJson(const std::string& text, JsonValue& out) {
  Parser parser(text);
  if (!parser.parseValue(out)) return false;
  parser.skipWhitespace();
  return parser.i == text.size();
}

std::string jsonEscape(const std::string& raw) {
  std::string out;
  out.reserve(raw.size() + 8);
  for (const char c : raw) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[7];
          std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned char>(c));
          out += buf;
        } else {
          out.push_back(c);
        }
    }
  }
  return out;
}

void JsonOut::separate() {
  buf_ += buf_.empty() ? "{" : ",";
}

JsonOut& JsonOut::str(const char* key, const std::string& value) {
  separate();
  buf_ += "\"";
  buf_ += jsonEscape(key);
  buf_ += "\":\"";
  buf_ += jsonEscape(value);
  buf_ += "\"";
  return *this;
}

JsonOut& JsonOut::num(const char* key, double value) {
  separate();
  char buf[32];
  // %.17g conserve la valeur exacte d'un double a l'aller-retour.
  std::snprintf(buf, sizeof(buf), "%.17g", value);
  buf_ += "\"";
  buf_ += jsonEscape(key);
  buf_ += "\":";
  buf_ += buf;
  return *this;
}

JsonOut& JsonOut::boolean(const char* key, bool value) {
  separate();
  buf_ += "\"";
  buf_ += jsonEscape(key);
  buf_ += "\":";
  buf_ += value ? "true" : "false";
  return *this;
}

JsonOut& JsonOut::raw(const char* key, const std::string& serialized) {
  separate();
  buf_ += "\"";
  buf_ += jsonEscape(key);
  buf_ += "\":";
  buf_ += serialized;
  return *this;
}

std::string JsonOut::done() const {
  return buf_.empty() ? "{}" : buf_ + "}";
}

std::string jsonStringArray(const std::vector<std::string>& items) {
  std::string out = "[";
  for (size_t k = 0; k < items.size(); ++k) {
    if (k > 0) out += ",";
    out += "\"";
    out += jsonEscape(items[k]);
    out += "\"";
  }
  out += "]";
  return out;
}

}  // namespace vethos
```

> Attention au `%.17g` de `JsonOut::num` : il produit `4242` pour un entier, mais peut produire une notation scientifique pour de très grandes valeurs. C'est précisément pourquoi `hwnd` et `processCreatedAt` passent par `str()` et non `num()` — voir les contraintes globales.

- [ ] **Step 6 : Lancer le test pour vérifier qu'il passe**

```bash
npm run test:sidecar
```

Attendu : la compilation du test réussit, puis

```
test_json
  ok   objet plat analyse
  ...
TOUS VERTS
```

La compilation du sidecar complet échouera ensuite (`main.cpp` absent) — normal à cette étape.

- [ ] **Step 7 : Commit**

```bash
git add native/vethos-probe/src/json.h native/vethos-probe/src/json.cpp native/vethos-probe/test/test_json.cpp scripts/build-sidecar.mjs package.json
git commit -m "feat(sidecar): codec JSON minimal sans dependance + script de compilation MSVC"
```

---

### Task 2 : Boucle JSONL du sidecar et pont Node

Le sidecar devient un processus vivant qui répond à `ping` et sort proprement sur `shutdown`. Côté Node, le protocole est encodé et décodé par un module pur, testé, séparé du pont qui gère le processus.

**Files:**
- Create: `native/vethos-probe/src/main.cpp`
- Create: `native/vethos-probe/src/win_windows.h` (talon)
- Create: `native/vethos-probe/src/win_windows.cpp` (talon)
- Create: `native/vethos-probe/src/undo_log.h` (talon)
- Create: `native/vethos-probe/src/undo_log.cpp` (talon)
- Create: `src/main/blocking/protocol.ts`
- Create: `src/main/blocking/protocol.test.ts`
- Create: `src/main/blocking/sidecar-bridge.ts`

**Interfaces:**
- Consumes: `vethos::JsonValue`, `vethos::parseJson`, `vethos::JsonOut` (Task 1).
- Produces:
  - TS : `encodeCommand(cmd: SidecarCommand) -> string`, `decodeLine(line: string) -> SidecarMessage | null`, types `SidecarCommand`, `SidecarEvent`, `SidecarReply`, `SidecarMessage`.
  - TS : classe `SidecarBridge` avec `start(): Promise<void>`, `request(cmd): Promise<SidecarReply>`, `on(event, handler)`, `shutdown(): Promise<void>`, `kill(): void`.
  - C++ : `handleCommand(const JsonValue&) -> std::string` dans `main.cpp`.

- [ ] **Step 1 : Écrire le test du protocole**

Créer `src/main/blocking/protocol.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { encodeCommand, decodeLine } from './protocol'

describe('encodeCommand', () => {
  it('produit une ligne JSON unique sans saut de ligne interne', () => {
    const line = encodeCommand({ id: 1, cmd: 'ping' })
    expect(line).toBe('{"id":1,"cmd":"ping"}')
    expect(line).not.toContain('\n')
  })

  it('sérialise la liste surveillée', () => {
    const line = encodeCommand({ id: 4, cmd: 'watch', exeNames: ['blender.exe', 'chrome.exe'] })
    expect(JSON.parse(line)).toEqual({
      id: 4,
      cmd: 'watch',
      exeNames: ['blender.exe', 'chrome.exe'],
    })
  })
})

describe('decodeLine', () => {
  it('décode une réponse', () => {
    const msg = decodeLine('{"id":1,"ok":true,"pong":"vethos-probe"}')
    expect(msg).toEqual({ kind: 'reply', id: 1, ok: true, payload: { pong: 'vethos-probe' } })
  })

  it('décode une réponse en erreur', () => {
    const msg = decodeLine('{"id":2,"ok":false,"error":"commande inconnue"}')
    expect(msg).toEqual({ kind: 'reply', id: 2, ok: false, error: 'commande inconnue' })
  })

  it('décode un événement', () => {
    const msg = decodeLine('{"event":"window-gone","hwnd":"9911"}')
    expect(msg).toEqual({ kind: 'event', event: 'window-gone', payload: { hwnd: '9911' } })
  })

  it('renvoie null sur une ligne illisible plutôt que de lever', () => {
    expect(decodeLine('pas du json')).toBeNull()
    expect(decodeLine('')).toBeNull()
    expect(decodeLine('   ')).toBeNull()
  })

  it('renvoie null sur du JSON valide mais hors protocole', () => {
    expect(decodeLine('{"quelque":"chose"}')).toBeNull()
    expect(decodeLine('[1,2,3]')).toBeNull()
  })

  it("garde le hwnd en chaîne — un nombre perdrait de la précision", () => {
    const msg = decodeLine('{"event":"window-gone","hwnd":"9007199254740993"}')
    expect(msg?.kind).toBe('event')
    if (msg?.kind === 'event') {
      expect(msg.payload['hwnd']).toBe('9007199254740993')
    }
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/main/blocking/protocol.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./protocol"`.

- [ ] **Step 3 : Implémenter le protocole**

Créer `src/main/blocking/protocol.ts` :

```ts
/**
 * Protocole JSONL entre le processus principal et le sidecar natif.
 *
 * Une ligne = un message. Les commandes portent un `id` numérique ; le sidecar
 * répond avec le même `id`. Les événements n'ont pas d'`id`, ils portent
 * `event`.
 *
 * `hwnd` et `processCreatedAt` circulent en chaînes décimales : ce sont des
 * valeurs 64 bits qui dépassent la précision entière de JavaScript.
 */

export type SidecarCommand =
  | { id: number; cmd: 'ping' }
  | { id: number; cmd: 'shutdown' }
  | { id: number; cmd: 'snapshot' }
  | { id: number; cmd: 'watch'; exeNames: string[] }
  | { id: number; cmd: 'release'; hwnd: string }
  | { id: number; cmd: 'release-all' }

export type SidecarReply = {
  kind: 'reply'
  id: number
  ok: boolean
  payload?: Record<string, unknown>
  error?: string
}

export type SidecarEvent = {
  kind: 'event'
  event: string
  payload: Record<string, unknown>
}

export type SidecarMessage = SidecarReply | SidecarEvent

/**
 * `Omit` ne distribue PAS sur une union : `keyof (A | B)` ne renvoie que les
 * clés communes, donc `Omit<SidecarCommand, 'id'>` réduirait le type à
 * `{ cmd: ... }` en perdant `exeNames`, `hwnd` et `exePath`. Cette version
 * distribue explicitement sur chaque membre de l'union.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Une commande sans son `id` — le pont attribue l'identifiant. */
export type SidecarRequest = DistributiveOmit<SidecarCommand, 'id'>

export function encodeCommand(cmd: SidecarCommand): string {
  return JSON.stringify(cmd)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeLine(line: string): SidecarMessage | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!isPlainObject(parsed)) return null

  const eventName = parsed['event']
  if (typeof eventName === 'string') {
    const payload: Record<string, unknown> = { ...parsed }
    delete payload['event']
    return { kind: 'event', event: eventName, payload }
  }

  const id = parsed['id']
  const ok = parsed['ok']
  if (typeof id === 'number' && typeof ok === 'boolean') {
    if (!ok) {
      const error = parsed['error']
      return { kind: 'reply', id, ok: false, error: typeof error === 'string' ? error : 'erreur inconnue' }
    }
    const payload: Record<string, unknown> = { ...parsed }
    delete payload['id']
    delete payload['ok']
    return { kind: 'reply', id, ok: true, payload }
  }

  return null
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/main/blocking/protocol.test.ts
```

Attendu : `Test Files 1 passed`, `Tests 7 passed`.

- [ ] **Step 5 : Écrire les talons C++ des modules à venir**

Ces deux paires de fichiers sont remplies aux Tasks 3 et 5. Elles existent maintenant pour que la ligne de compilation du script soit valide dès à présent.

Créer `native/vethos-probe/src/win_windows.h` :

```cpp
#pragma once

#include <string>
#include <vector>

namespace vethos {

struct WindowRecord {
  std::string hwnd;              // decimal, 64 bits, en chaine
  unsigned long pid = 0;
  std::string exeName;           // minuscules
  std::string title;
  std::string className;
  long exStyle = 0;
  long style = 0;
  bool hasOwner = false;
  bool cloaked = false;
  bool visible = false;
  bool elevated = false;
  std::string processCreatedAt;  // FILETIME decimal, en chaine
  long left = 0;
  long top = 0;
  long right = 0;
  long bottom = 0;
  std::string showState;         // "normal" | "minimized" | "maximized"
};

// Enumere les fenetres de premier niveau et renseigne leurs attributs bruts.
// Ne filtre rien : la decision appartient au TypeScript (window-filter.ts).
std::vector<WindowRecord> enumerateTopLevelWindows();

std::string serializeWindowRecord(const WindowRecord& record);

}  // namespace vethos
```

Créer `native/vethos-probe/src/win_windows.cpp` :

```cpp
#include "win_windows.h"

namespace vethos {

std::vector<WindowRecord> enumerateTopLevelWindows() {
  return {};  // rempli en Task 5
}

std::string serializeWindowRecord(const WindowRecord&) {
  return "{}";  // rempli en Task 5
}

}  // namespace vethos
```

Créer `native/vethos-probe/src/undo_log.h` :

```cpp
#pragma once

#include <string>
#include <vector>

namespace vethos {

// Etat d'origine d'une fenetre, capture avant toute mutation.
struct UndoEntry {
  std::string hwnd;
  unsigned long pid = 0;
  std::string processCreatedAt;
  bool taskbarWasVisible = true;
  std::string originalShowState = "normal";
  bool audioWasMuted = false;
};

class UndoLog {
 public:
  void remember(const UndoEntry& entry);
  bool forget(const std::string& hwnd);
  // Restaure une fenetre dans son etat capture. Renvoie la liste des choses
  // effectivement restaurees, pour la preuve dans les journaux.
  std::vector<std::string> restore(const std::string& hwnd);
  std::vector<std::string> restoreAll();
  bool empty() const;

 private:
  std::vector<UndoEntry> entries_;
};

}  // namespace vethos
```

Créer `native/vethos-probe/src/undo_log.cpp` :

```cpp
#include "undo_log.h"

namespace vethos {

void UndoLog::remember(const UndoEntry& entry) {
  for (UndoEntry& existing : entries_) {
    if (existing.hwnd == entry.hwnd) return;  // la premiere capture fait foi
  }
  entries_.push_back(entry);
}

bool UndoLog::forget(const std::string& hwnd) {
  for (size_t i = 0; i < entries_.size(); ++i) {
    if (entries_[i].hwnd == hwnd) {
      entries_.erase(entries_.begin() + static_cast<long long>(i));
      return true;
    }
  }
  return false;
}

std::vector<std::string> UndoLog::restore(const std::string& hwnd) {
  // Les actions de restauration reelles arrivent en Plan B, quand les
  // mutations existent. Ici on retire simplement l'entree.
  return forget(hwnd) ? std::vector<std::string>{"entry-cleared"} : std::vector<std::string>{};
}

std::vector<std::string> UndoLog::restoreAll() {
  std::vector<std::string> restored;
  while (!entries_.empty()) {
    const std::string hwnd = entries_.back().hwnd;
    entries_.pop_back();
    restored.push_back(hwnd);
  }
  return restored;
}

bool UndoLog::empty() const {
  return entries_.empty();
}

}  // namespace vethos
```

- [ ] **Step 6 : Écrire la boucle principale du sidecar**

Créer `native/vethos-probe/src/main.cpp` :

```cpp
// vethos-probe : pont natif unique entre Vethos et Windows.
//
// Protocole : JSONL sur stdin/stdout, une ligne par message.
// stderr est reserve aux traces de diagnostic.
//
// Arguments :
//   --parent-pid <pid>   processus a surveiller (death-watch, Task 7)
#include <fcntl.h>
#include <io.h>
#include <windows.h>

#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>

#include "json.h"
#include "undo_log.h"
#include "win_windows.h"

namespace {

vethos::UndoLog g_undoLog;
bool g_shuttingDown = false;

void emit(const std::string& line) {
  std::fwrite(line.data(), 1, line.size(), stdout);
  std::fwrite("\n", 1, 1, stdout);
  std::fflush(stdout);
}

void trace(const std::string& message) {
  std::fprintf(stderr, "[probe] %s\n", message.c_str());
  std::fflush(stderr);
}

std::string replyError(double id, const std::string& message) {
  return vethos::JsonOut().num("id", id).boolean("ok", false).str("error", message).done();
}

std::string handleCommand(const vethos::JsonValue& command) {
  const double id = command.numberOr("id", -1);
  const std::string cmd = command.stringOr("cmd", "");

  if (cmd == "ping") {
    return vethos::JsonOut()
        .num("id", id)
        .boolean("ok", true)
        .str("pong", "vethos-probe")
        .num("pid", static_cast<double>(GetCurrentProcessId()))
        .done();
  }

  if (cmd == "shutdown") {
    // Arret VOULU : on annule tout et on sort sans demander de relance.
    const std::vector<std::string> restored = g_undoLog.restoreAll();
    g_shuttingDown = true;
    return vethos::JsonOut()
        .num("id", id)
        .boolean("ok", true)
        .raw("restored", vethos::jsonStringArray(restored))
        .done();
  }

  if (cmd == "release-all") {
    const std::vector<std::string> restored = g_undoLog.restoreAll();
    return vethos::JsonOut()
        .num("id", id)
        .boolean("ok", true)
        .raw("restored", vethos::jsonStringArray(restored))
        .done();
  }

  if (cmd == "release") {
    const std::string hwnd = command.stringOr("hwnd", "");
    if (hwnd.empty()) return replyError(id, "hwnd manquant");
    const std::vector<std::string> restored = g_undoLog.restore(hwnd);
    return vethos::JsonOut()
        .num("id", id)
        .boolean("ok", true)
        .raw("restored", vethos::jsonStringArray(restored))
        .done();
  }

  if (cmd == "snapshot") {
    const std::vector<vethos::WindowRecord> records = vethos::enumerateTopLevelWindows();
    std::string serialized = "[";
    for (size_t k = 0; k < records.size(); ++k) {
      if (k > 0) serialized += ",";
      serialized += vethos::serializeWindowRecord(records[k]);
    }
    serialized += "]";
    return vethos::JsonOut()
        .num("id", id)
        .boolean("ok", true)
        .raw("windows", serialized)
        .done();
  }

  if (cmd == "watch") {
    // La liste surveillee est appliquee en Task 5 ; on accuse reception ici
    // pour que le pont Node puisse etre teste des maintenant.
    return vethos::JsonOut()
        .num("id", id)
        .boolean("ok", true)
        .num("watching", static_cast<double>(command.stringArray("exeNames").size()))
        .done();
  }

  return replyError(id, "commande inconnue : " + cmd);
}

}  // namespace

int main(int argc, char** argv) {
  // stdout en binaire : pas de traduction \n -> \r\n, le JSONL reste exact.
  _setmode(_fileno(stdout), _O_BINARY);

  unsigned long parentPid = 0;
  for (int k = 1; k < argc; ++k) {
    const std::string arg = argv[k];
    if (arg == "--parent-pid" && k + 1 < argc) {
      parentPid = std::strtoul(argv[k + 1], nullptr, 10);
      ++k;
    }
  }
  trace("demarre pid=" + std::to_string(GetCurrentProcessId()) +
        " parent=" + std::to_string(parentPid));

  std::string line;
  while (!g_shuttingDown && std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty()) continue;

    vethos::JsonValue command;
    if (!vethos::parseJson(line, command)) {
      emit(vethos::JsonOut().num("id", -1).boolean("ok", false).str("error", "json illisible").done());
      continue;
    }
    emit(handleCommand(command));
  }

  // Sortie par EOF de stdin (parent disparu) ou par shutdown explicite.
  // Dans les deux cas on annule tout avant de mourir : aucune fenetre piegee.
  const std::vector<std::string> restored = g_undoLog.restoreAll();
  trace("sortie, " + std::to_string(restored.size()) + " fenetre(s) restauree(s)" +
        (g_shuttingDown ? " (arret voulu)" : " (eof)"));
  return 0;
}
```

- [ ] **Step 7 : Compiler le sidecar en entier**

```bash
npm run test:sidecar
```

Attendu : `TOUS VERTS` du codec, puis `sidecar compile -> ...\resources\sidecar\vethos-probe.exe`.

- [ ] **Step 8 : Vérifier le sidecar à la main**

```bash
echo '{"id":1,"cmd":"ping"}' | ./resources/sidecar/vethos-probe.exe
```

Attendu, sur stdout : `{"id":1,"ok":true,"pong":"vethos-probe","pid":<nombre>}`
et, sur stderr, une ligne `[probe] demarre pid=... parent=0`.

**Vérification du bug 3 (terminaux noirs) :** aucune fenêtre de console ne doit
apparaître. Ici on lance depuis un terminal existant, donc le test réel du bug 3
est celui du Step 11 — le lancement depuis Node avec `windowsHide: true`.

- [ ] **Step 9 : Écrire le pont Node**

Créer `src/main/blocking/sidecar-bridge.ts` :

```ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import { existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import log from '@main/logging/setup'
import {
  decodeLine,
  encodeCommand,
  type SidecarCommand,
  type SidecarReply,
  type SidecarRequest,
} from './protocol'

const REQUEST_TIMEOUT_MS = 10_000

type Pending = {
  resolve: (reply: SidecarReply) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Pont vers le sidecar natif.
 *
 * Émet les événements du sidecar sous leur propre nom (`window-appeared`, ...)
 * et `exit` quand le processus meurt.
 *
 * Le sidecar est lancé avec `windowsHide: true` et sans shell : c'est ce qui
 * empêche l'apparition d'une console noire (bug 3 des notes de reprise).
 */
export class SidecarBridge extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private reader: Interface | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  private stopped = false

  constructor(private readonly exePath: string) {
    super()
  }

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null
  }

  start(): void {
    if (this.isRunning()) return
    if (!existsSync(this.exePath)) {
      throw new Error(
        `Sidecar introuvable : ${this.exePath}\nLance "npm run build:sidecar" pour le compiler.`,
      )
    }

    this.stopped = false
    const child = spawn(this.exePath, ['--parent-pid', String(process.pid)], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    })
    this.child = child

    this.reader = createInterface({ input: child.stdout })
    this.reader.on('line', (line) => this.onLine(line))

    child.stderr.on('data', (chunk: Buffer) => {
      log.debug(`[sidecar] ${chunk.toString('utf8').trimEnd()}`)
    })

    child.on('exit', (code, signal) => {
      log.info('[sidecar] processus sorti', { code, signal, voulu: this.stopped })
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer)
        pending.reject(new Error('sidecar sorti avant la réponse'))
      }
      this.pending.clear()
      this.child = null
      this.reader?.close()
      this.reader = null
      this.emit('exit', { code, signal, intentional: this.stopped })
    })
  }

  private onLine(line: string): void {
    const message = decodeLine(line)
    if (message === null) {
      log.warn('[sidecar] ligne illisible ignorée', { line: line.slice(0, 200) })
      return
    }
    if (message.kind === 'event') {
      this.emit(message.event, message.payload)
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) {
      log.warn('[sidecar] réponse sans requête correspondante', { id: message.id })
      return
    }
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    pending.resolve(message)
  }

  request(cmd: SidecarRequest): Promise<SidecarReply> {
    const child = this.child
    if (child === null) return Promise.reject(new Error('sidecar non démarré'))

    const id = this.nextId++
    const full = { id, ...cmd } as SidecarCommand

    return new Promise<SidecarReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`sidecar sans réponse après ${REQUEST_TIMEOUT_MS} ms : ${full.cmd}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${encodeCommand(full)}\n`, (err) => {
        if (err) {
          this.pending.delete(id)
          clearTimeout(timer)
          reject(err)
        }
      })
    })
  }

  /**
   * Arrêt VOULU. Le sidecar annule ses mutations puis sort sans demander de
   * relance de Vethos — la distinction du §5.2 de la spec.
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning()) return
    this.stopped = true
    try {
      await this.request({ cmd: 'shutdown' })
    } catch (err) {
      log.warn('[sidecar] shutdown sans réponse, fermeture de stdin', err)
    }
    this.child?.stdin.end()
  }

  /** Coupe le tuyau sans prévenir. Réservé aux tests et aux cas désespérés. */
  kill(): void {
    this.child?.kill()
  }
}
```

- [ ] **Step 10 : Écrire le script de preuve réelle**

Créer `scripts/sidecar-smoke.mjs`. Il produit les preuves horodatées exigées par
le §9.2 de la spec. Il grossira aux tâches suivantes.

```js
// Preuve reelle du pont natif. Sortie horodatee, a coller dans le rapport.
//
//   node scripts/sidecar-smoke.mjs
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXE = join(ROOT, 'resources', 'sidecar', 'vethos-probe.exe')

if (!existsSync(EXE)) {
  console.error(`Sidecar absent : ${EXE}\nLance d'abord "npm run build:sidecar".`)
  process.exit(1)
}

const t0 = Date.now()
const stamp = () => `+${String(Date.now() - t0).padStart(5, ' ')}ms`
const say = (msg) => console.log(`${stamp()}  ${msg}`)

const child = spawn(EXE, ['--parent-pid', String(process.pid)], {
  windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: false,
})

const replies = new Map()
let nextId = 1

createInterface({ input: child.stdout }).on('line', (line) => {
  say(`<- ${line}`)
  try {
    const msg = JSON.parse(line)
    if (typeof msg.id === 'number' && replies.has(msg.id)) {
      replies.get(msg.id)(msg)
      replies.delete(msg.id)
    }
  } catch {
    /* trace uniquement */
  }
})
createInterface({ input: child.stderr }).on('line', (line) => say(`   ${line}`))

function send(cmd) {
  const id = nextId++
  const payload = JSON.stringify({ id, ...cmd })
  say(`-> ${payload}`)
  return new Promise((res) => {
    replies.set(id, res)
    child.stdin.write(`${payload}\n`)
  })
}

say('=== PREUVE 1 : le sidecar repond ===')
const pong = await send({ cmd: 'ping' })
say(pong.ok && pong.pong === 'vethos-probe' ? 'PASS ping' : 'ECHEC ping')

say('=== PREUVE 2 : commande inconnue refusee proprement, sans crash ===')
const bad = await send({ cmd: 'nawak' })
say(!bad.ok && typeof bad.error === 'string' ? 'PASS commande inconnue' : 'ECHEC')
const stillAlive = await send({ cmd: 'ping' })
say(stillAlive.ok ? 'PASS toujours vivant apres commande inconnue' : 'ECHEC processus mort')

say('=== PREUVE 3 : arret voulu, sortie propre ===')
await send({ cmd: 'shutdown' })
child.stdin.end()
await new Promise((res) => child.on('exit', res))
say(`PASS sidecar sorti avec le code ${child.exitCode}`)
```

- [ ] **Step 11 : Exécuter la preuve réelle**

```bash
node scripts/sidecar-smoke.mjs
```

Attendu : trois `PASS`, un code de sortie `0`, et **aucune fenêtre de console
noire n'apparaît à l'écran pendant l'exécution** — c'est la vérification du bug 3.

- [ ] **Step 12 : Vérifier la suite complète et le typecheck**

```bash
npx vitest run && npm run typecheck:node
```

Attendu : `Tests 214 passed` (206 de référence + 8 de `protocol.test.ts`),
`typecheck:node` vert.

> `typecheck:web` reste rouge sur `ancres.store.ts` et `learning.store.ts` —
> défaut préexistant, étranger à ce plan, ne pas corriger ici.

- [ ] **Step 13 : Commit**

```bash
git add native/vethos-probe/src src/main/blocking scripts/sidecar-smoke.mjs
git commit -m "feat(sidecar): boucle JSONL, pont Node et preuve reelle bout en bout"
```

---

### Task 3 : Prédicat de fenêtre cible — le correctif du bug 4

C'est ici que se règle la multiplication de fenêtres parasites dans la barre des
tâches. L'ancien code touchait toutes les fenêtres mémorisées, y compris les
fenêtres internes (`BlenderGLEW`, écrans de démarrage, boîtes de dialogue). Le
prédicat vit en TypeScript pur, alimenté par les attributs bruts du sidecar,
donc il est entièrement testable.

**Files:**
- Create: `src/main/blocking/window-filter.ts`
- Create: `src/main/blocking/window-filter.test.ts`

**Interfaces:**
- Consumes: rien (module pur autonome).
- Produces: type `WindowInfo`, `isBlockingTarget(w: WindowInfo) -> boolean`, `rejectionReason(w: WindowInfo) -> string | null`, constantes `WS_EX_TOOLWINDOW`, `WS_EX_APPWINDOW`. Consommé par le contrôleur du Plan B.

- [ ] **Step 1 : Écrire le test**

Créer `src/main/blocking/window-filter.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  isBlockingTarget,
  rejectionReason,
  WS_EX_APPWINDOW,
  WS_EX_TOOLWINDOW,
  type WindowInfo,
} from './window-filter'

function makeWindow(overrides: Partial<WindowInfo> = {}): WindowInfo {
  return {
    hwnd: '1000',
    pid: 42,
    exeName: 'blender.exe',
    title: 'Blender',
    className: 'GHOST_WindowClass',
    exStyle: 0,
    style: 0,
    hasOwner: false,
    cloaked: false,
    visible: true,
    ...overrides,
  }
}

describe('isBlockingTarget', () => {
  it('accepte une fenêtre principale ordinaire', () => {
    expect(isBlockingTarget(makeWindow())).toBe(true)
    expect(rejectionReason(makeWindow())).toBeNull()
  })

  it('rejette une fenêtre invisible', () => {
    const w = makeWindow({ visible: false })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('invisible')
  })

  it('rejette une fenêtre masquée par DWM', () => {
    const w = makeWindow({ cloaked: true })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('masquée par DWM')
  })

  it('rejette un titre vide ou fait uniquement de blancs', () => {
    expect(isBlockingTarget(makeWindow({ title: '' }))).toBe(false)
    expect(isBlockingTarget(makeWindow({ title: '   ' }))).toBe(false)
    expect(rejectionReason(makeWindow({ title: '' }))).toBe('titre vide')
  })

  it('rejette une fenêtre outil — bug 4, les fenêtres internes', () => {
    const w = makeWindow({ exStyle: WS_EX_TOOLWINDOW })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('fenêtre outil')
  })

  it('rejette une fenêtre possédée — boîtes de dialogue, écrans de démarrage', () => {
    const w = makeWindow({ hasOwner: true })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('fenêtre possédée')
  })

  it('accepte une fenêtre possédée qui déclare WS_EX_APPWINDOW', () => {
    // WS_EX_APPWINDOW est une demande explicite de presence dans la barre des
    // taches : elle prime sur la regle du proprietaire.
    expect(isBlockingTarget(makeWindow({ hasOwner: true, exStyle: WS_EX_APPWINDOW }))).toBe(true)
  })

  it('rejette WS_EX_TOOLWINDOW même avec WS_EX_APPWINDOW', () => {
    const w = makeWindow({ exStyle: WS_EX_TOOLWINDOW | WS_EX_APPWINDOW })
    expect(isBlockingTarget(w)).toBe(false)
    expect(rejectionReason(w)).toBe('fenêtre outil')
  })

  it('rejette les classes assistantes connues', () => {
    for (const className of ['IME', 'MSCTFIME UI', 'Default IME', 'tooltips_class32', 'SysShadow']) {
      const w = makeWindow({ className })
      expect(isBlockingTarget(w), className).toBe(false)
      expect(rejectionReason(w)).toBe('classe assistante')
    }
  })

  it('accepte les vraies fenêtres de navigateur et UWP', () => {
    expect(isBlockingTarget(makeWindow({ className: 'Chrome_WidgetWin_1' }))).toBe(true)
    expect(isBlockingTarget(makeWindow({ className: 'ApplicationFrameWindow' }))).toBe(true)
  })

  it('ne se laisse pas piéger par la casse de la classe', () => {
    expect(isBlockingTarget(makeWindow({ className: 'ime' }))).toBe(false)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/main/blocking/window-filter.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./window-filter"`.

- [ ] **Step 3 : Implémenter le prédicat**

Créer `src/main/blocking/window-filter.ts` :

```ts
/**
 * Décide si une fenêtre est une cible de blocage valide.
 *
 * Correctif du bug 4 : l'ancienne implémentation touchait toutes les fenêtres
 * mémorisées d'un processus, y compris ses fenêtres internes — d'où les
 * doublons et les onglets parasites dans la barre des tâches au moment de
 * restaurer. On ne retient ici que les fenêtres « alt-tab-ables », celles
 * qu'un utilisateur perçoit comme une fenêtre d'application.
 *
 * Le sidecar n'applique aucun filtre : il émet les attributs bruts et cette
 * fonction décide. C'est ce qui rend la décision testable.
 */

export const WS_EX_TOOLWINDOW = 0x00000080
export const WS_EX_APPWINDOW = 0x00040000

/** Filet de sécurité, pas le filtre principal : ces classes ne sont jamais des fenêtres d'application. */
const HELPER_CLASSES = new Set([
  'ime',
  'msctfime ui',
  'default ime',
  'tooltips_class32',
  'sysshadow',
])

export type WindowInfo = {
  hwnd: string
  pid: number
  exeName: string
  title: string
  className: string
  exStyle: number
  style: number
  hasOwner: boolean
  cloaked: boolean
  visible: boolean
}

/** Renvoie le motif du rejet, ou `null` si la fenêtre est une cible valide. */
export function rejectionReason(w: WindowInfo): string | null {
  if (!w.visible) return 'invisible'
  if (w.cloaked) return 'masquée par DWM'
  if (w.title.trim().length === 0) return 'titre vide'
  if ((w.exStyle & WS_EX_TOOLWINDOW) !== 0) return 'fenêtre outil'
  if (HELPER_CLASSES.has(w.className.toLowerCase())) return 'classe assistante'
  // WS_EX_APPWINDOW est une demande explicite de figurer dans la barre des
  // tâches : elle prime sur la règle du propriétaire.
  if (w.hasOwner && (w.exStyle & WS_EX_APPWINDOW) === 0) return 'fenêtre possédée'
  return null
}

export function isBlockingTarget(w: WindowInfo): boolean {
  return rejectionReason(w) === null
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/main/blocking/window-filter.test.ts
```

Attendu : `Tests 11 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/main/blocking/window-filter.ts src/main/blocking/window-filter.test.ts
git commit -m "feat(blocking): predicat de fenetre cible — correctif du bug 4"
```

---

### Task 4 : Placement de l'overlay — le correctif du bug 5

L'overlay se retrouvait au coin `0,0` parce que les bounds étaient lues sur une
fenêtre cachée ou minimisée. Windows place les fenêtres minimisées à `-32000`.
Cette fonction refuse de placer quoi que ce soit à partir de bounds
suspectes : elle renvoie « masqué », jamais une position par défaut.

**Files:**
- Create: `src/main/blocking/geometry.ts`
- Create: `src/main/blocking/geometry.test.ts`

**Interfaces:**
- Consumes: rien (module pur autonome).
- Produces: types `Rect`, `ShowState`, `Placement`, `TargetGeometry` ; fonction `computeOverlayPlacement(t: TargetGeometry) -> Placement`. Consommé par `overlay-manager.ts` du Plan B.

- [ ] **Step 1 : Écrire le test**

Créer `src/main/blocking/geometry.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { computeOverlayPlacement, type TargetGeometry } from './geometry'

function makeTarget(overrides: Partial<TargetGeometry> = {}): TargetGeometry {
  return {
    bounds: { left: 100, top: 200, right: 900, bottom: 800 },
    showState: 'normal',
    cloaked: false,
    visible: true,
    ...overrides,
  }
}

describe('computeOverlayPlacement', () => {
  it('place l’overlay exactement sur des bounds valides', () => {
    expect(computeOverlayPlacement(makeTarget())).toEqual({
      kind: 'placed',
      x: 100,
      y: 200,
      width: 800,
      height: 600,
    })
  })

  it('suit la cible quand elle est maximisée', () => {
    const placement = computeOverlayPlacement(
      makeTarget({ showState: 'maximized', bounds: { left: 0, top: 0, right: 2560, bottom: 1392 } }),
    )
    expect(placement).toEqual({ kind: 'placed', x: 0, y: 0, width: 2560, height: 1392 })
  })

  it('masque au lieu de placer à -32000 — le bug 5', () => {
    const placement = computeOverlayPlacement(
      makeTarget({ bounds: { left: -32000, top: -32000, right: -31840, bottom: -31972 } }),
    )
    expect(placement).toEqual({ kind: 'hidden', reason: 'bounds hors écran (-32000)' })
  })

  it('masque quand la cible est minimisée', () => {
    expect(computeOverlayPlacement(makeTarget({ showState: 'minimized' }))).toEqual({
      kind: 'hidden',
      reason: 'cible minimisée',
    })
  })

  it('masque quand la cible est invisible', () => {
    expect(computeOverlayPlacement(makeTarget({ visible: false }))).toEqual({
      kind: 'hidden',
      reason: 'cible invisible',
    })
  })

  it('masque quand la cible est masquée par DWM', () => {
    expect(computeOverlayPlacement(makeTarget({ cloaked: true }))).toEqual({
      kind: 'hidden',
      reason: 'cible masquée par DWM',
    })
  })

  it('masque sur des bounds dégénérées plutôt que de placer une fenêtre nulle', () => {
    const zeroWidth = makeTarget({ bounds: { left: 50, top: 50, right: 50, bottom: 400 } })
    expect(computeOverlayPlacement(zeroWidth)).toEqual({
      kind: 'hidden',
      reason: 'bounds dégénérées',
    })
    const inverted = makeTarget({ bounds: { left: 500, top: 50, right: 100, bottom: 400 } })
    expect(computeOverlayPlacement(inverted)).toEqual({
      kind: 'hidden',
      reason: 'bounds dégénérées',
    })
  })

  it('accepte des coordonnées négatives légitimes — écran secondaire à gauche', () => {
    const placement = computeOverlayPlacement(
      makeTarget({ bounds: { left: -1920, top: 0, right: -1120, bottom: 600 } }),
    )
    expect(placement).toEqual({ kind: 'placed', x: -1920, y: 0, width: 800, height: 600 })
  })

  it('ne place jamais à 0,0 par défaut quand l’état est douteux', () => {
    // Garde-fou explicite du bug 5 : aucune combinaison douteuse ne doit
    // produire un placement, encore moins un placement au coin de l'ecran.
    const suspects: TargetGeometry[] = [
      makeTarget({ visible: false }),
      makeTarget({ cloaked: true }),
      makeTarget({ showState: 'minimized' }),
      makeTarget({ bounds: { left: -32000, top: -32000, right: -31000, bottom: -31000 } }),
      makeTarget({ bounds: { left: 0, top: 0, right: 0, bottom: 0 } }),
    ]
    for (const target of suspects) {
      expect(computeOverlayPlacement(target).kind).toBe('hidden')
    }
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/main/blocking/geometry.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./geometry"`.

- [ ] **Step 3 : Implémenter le placement**

Créer `src/main/blocking/geometry.ts` :

```ts
/**
 * Calcule où poser l'overlay à partir de l'état de sa cible.
 *
 * Correctif du bug 5 : l'overlay atterrissait au coin `0,0` parce que les
 * bounds étaient lues sur une fenêtre cachée ou minimisée. Windows place les
 * fenêtres minimisées à `-32000`. La règle est simple et sans exception —
 * quand l'état est douteux, on masque l'overlay, on ne devine jamais une
 * position.
 */

export type Rect = { left: number; top: number; right: number; bottom: number }

export type ShowState = 'normal' | 'minimized' | 'maximized'

export type TargetGeometry = {
  bounds: Rect
  showState: ShowState
  cloaked: boolean
  visible: boolean
}

export type Placement =
  | { kind: 'hidden'; reason: string }
  | { kind: 'placed'; x: number; y: number; width: number; height: number }

/** Sentinelle Windows pour les fenêtres minimisées. */
const OFFSCREEN_SENTINEL = -30000

export function computeOverlayPlacement(t: TargetGeometry): Placement {
  if (!t.visible) return { kind: 'hidden', reason: 'cible invisible' }
  if (t.cloaked) return { kind: 'hidden', reason: 'cible masquée par DWM' }
  if (t.showState === 'minimized') return { kind: 'hidden', reason: 'cible minimisée' }

  if (t.bounds.left <= OFFSCREEN_SENTINEL || t.bounds.top <= OFFSCREEN_SENTINEL) {
    return { kind: 'hidden', reason: 'bounds hors écran (-32000)' }
  }

  const width = t.bounds.right - t.bounds.left
  const height = t.bounds.bottom - t.bounds.top
  if (width <= 0 || height <= 0) return { kind: 'hidden', reason: 'bounds dégénérées' }

  return { kind: 'placed', x: t.bounds.left, y: t.bounds.top, width, height }
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/main/blocking/geometry.test.ts
```

Attendu : `Tests 9 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/main/blocking/geometry.ts src/main/blocking/geometry.test.ts
git commit -m "feat(blocking): placement de l'overlay — correctif du bug 5"
```

---

### Task 5 : Énumération réelle des fenêtres

Le sidecar remplit enfin `enumerateTopLevelWindows`. Il n'applique aucun filtre
métier : il émet les attributs bruts que `window-filter.ts` consomme. Les bounds
proviennent de `DWMWA_EXTENDED_FRAME_BOUNDS` — le rectangle visible réel, pas
celui de `GetWindowRect` qui inclut l'ombre portée.

**Files:**
- Modify: `native/vethos-probe/src/win_windows.cpp` (remplace les talons)
- Modify: `scripts/sidecar-smoke.mjs` (ajout d'une preuve)

**Interfaces:**
- Consumes: `vethos::WindowRecord`, `vethos::JsonOut`, `vethos::jsonEscape` (Tasks 1 et 2) ; le type TS `WindowInfo` (Task 3) que la sérialisation doit satisfaire champ pour champ.
- Produces: `enumerateTopLevelWindows()` renseigné, `serializeWindowRecord()` renseigné. La commande `snapshot` renvoie enfin des données.

- [ ] **Step 1 : Implémenter l'énumération**

Remplacer intégralement `native/vethos-probe/src/win_windows.cpp` :

```cpp
#include "win_windows.h"

#include <dwmapi.h>
#include <windows.h>

#include <algorithm>
#include <cctype>
#include <string>

#include "json.h"

namespace vethos {
namespace {

std::string toUtf8(const std::wstring& wide) {
  if (wide.empty()) return {};
  const int needed = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), static_cast<int>(wide.size()),
                                         nullptr, 0, nullptr, nullptr);
  if (needed <= 0) return {};
  std::string out(static_cast<size_t>(needed), '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), static_cast<int>(wide.size()), out.data(), needed,
                      nullptr, nullptr);
  return out;
}

std::string toLower(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return value;
}

std::string windowText(HWND hwnd) {
  const int length = GetWindowTextLengthW(hwnd);
  if (length <= 0) return {};
  std::wstring buffer(static_cast<size_t>(length) + 1, L'\0');
  const int copied = GetWindowTextW(hwnd, buffer.data(), length + 1);
  buffer.resize(static_cast<size_t>(std::max(copied, 0)));
  return toUtf8(buffer);
}

std::string windowClass(HWND hwnd) {
  wchar_t buffer[256] = {0};
  const int copied = GetClassNameW(hwnd, buffer, 256);
  return toUtf8(std::wstring(buffer, static_cast<size_t>(std::max(copied, 0))));
}

bool isCloaked(HWND hwnd) {
  int cloaked = 0;
  const HRESULT hr = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof(cloaked));
  return SUCCEEDED(hr) && cloaked != 0;
}

// Rectangle visible reel. GetWindowRect inclut l'ombre portee et donnerait un
// overlay trop grand de quelques pixels sur chaque bord.
RECT trueBounds(HWND hwnd) {
  RECT rect = {0, 0, 0, 0};
  if (FAILED(DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &rect, sizeof(rect)))) {
    GetWindowRect(hwnd, &rect);
  }
  return rect;
}

std::string showStateOf(HWND hwnd) {
  WINDOWPLACEMENT placement = {};
  placement.length = sizeof(placement);
  if (!GetWindowPlacement(hwnd, &placement)) return "normal";
  switch (placement.showCmd) {
    case SW_SHOWMINIMIZED:
    case SW_MINIMIZE:
    case SW_SHOWMINNOACTIVE:
      return "minimized";
    case SW_SHOWMAXIMIZED:
      return "maximized";
    default:
      return "normal";
  }
}

std::string exeNameOf(HANDLE process) {
  wchar_t path[MAX_PATH] = {0};
  DWORD size = MAX_PATH;
  if (!QueryFullProcessImageNameW(process, 0, path, &size)) return {};
  const std::wstring full(path, size);
  const size_t slash = full.find_last_of(L"\\/");
  return toLower(toUtf8(slash == std::wstring::npos ? full : full.substr(slash + 1)));
}

std::string creationTimeOf(HANDLE process) {
  FILETIME creation = {}, exitTime = {}, kernel = {}, user = {};
  if (!GetProcessTimes(process, &creation, &exitTime, &kernel, &user)) return "0";
  ULARGE_INTEGER value;
  value.LowPart = creation.dwLowDateTime;
  value.HighPart = creation.dwHighDateTime;
  // Chaine decimale : 1.3e17 depasse la precision entiere de JavaScript.
  return std::to_string(value.QuadPart);
}

bool isElevated(HANDLE process) {
  HANDLE token = nullptr;
  if (!OpenProcessToken(process, TOKEN_QUERY, &token)) return false;
  TOKEN_ELEVATION elevation = {};
  DWORD returned = 0;
  const bool ok =
      GetTokenInformation(token, TokenElevation, &elevation, sizeof(elevation), &returned) != 0;
  CloseHandle(token);
  return ok && elevation.TokenIsElevated != 0;
}

BOOL CALLBACK collect(HWND hwnd, LPARAM param) {
  auto* out = reinterpret_cast<std::vector<WindowRecord>*>(param);

  WindowRecord record;
  record.hwnd = std::to_string(reinterpret_cast<unsigned long long>(hwnd));
  record.visible = IsWindowVisible(hwnd) != FALSE;
  record.title = windowText(hwnd);
  record.className = windowClass(hwnd);
  record.exStyle = static_cast<long>(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  record.style = static_cast<long>(GetWindowLongPtrW(hwnd, GWL_STYLE));
  record.hasOwner = GetWindow(hwnd, GW_OWNER) != nullptr;
  record.cloaked = isCloaked(hwnd);
  record.showState = showStateOf(hwnd);

  const RECT bounds = trueBounds(hwnd);
  record.left = bounds.left;
  record.top = bounds.top;
  record.right = bounds.right;
  record.bottom = bounds.bottom;

  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  record.pid = pid;

  // PROCESS_QUERY_LIMITED_INFORMATION suffit et reussit sur les processus
  // elevees, la ou PROCESS_QUERY_INFORMATION echouerait.
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (process != nullptr) {
    record.exeName = exeNameOf(process);
    record.processCreatedAt = creationTimeOf(process);
    record.elevated = isElevated(process);
    CloseHandle(process);
  } else {
    record.processCreatedAt = "0";
  }

  out->push_back(record);
  return TRUE;
}

}  // namespace

std::vector<WindowRecord> enumerateTopLevelWindows() {
  std::vector<WindowRecord> out;
  EnumWindows(collect, reinterpret_cast<LPARAM>(&out));
  return out;
}

std::string serializeWindowRecord(const WindowRecord& record) {
  const std::string bounds = JsonOut()
                                 .num("left", static_cast<double>(record.left))
                                 .num("top", static_cast<double>(record.top))
                                 .num("right", static_cast<double>(record.right))
                                 .num("bottom", static_cast<double>(record.bottom))
                                 .done();
  return JsonOut()
      .str("hwnd", record.hwnd)
      .num("pid", static_cast<double>(record.pid))
      .str("exeName", record.exeName)
      .str("title", record.title)
      .str("className", record.className)
      .num("exStyle", static_cast<double>(record.exStyle))
      .num("style", static_cast<double>(record.style))
      .boolean("hasOwner", record.hasOwner)
      .boolean("cloaked", record.cloaked)
      .boolean("visible", record.visible)
      .boolean("elevated", record.elevated)
      .str("processCreatedAt", record.processCreatedAt)
      .str("showState", record.showState)
      .raw("bounds", bounds)
      .done();
}

}  // namespace vethos
```

- [ ] **Step 2 : Recompiler**

```bash
npm run build:sidecar
```

Attendu : `sidecar compile -> ...\resources\sidecar\vethos-probe.exe`, sans avertissement bloquant.

- [ ] **Step 3 : Ajouter la preuve d'énumération au script de fumée**

Dans `scripts/sidecar-smoke.mjs`, insérer ce bloc **avant** la section
`=== PREUVE 3 : arret voulu ===` :

```js
say('=== PREUVE 3 : enumeration reelle des fenetres ===')
const snap = await send({ cmd: 'snapshot' })
const windows = snap.windows ?? []
say(`${windows.length} fenetre(s) de premier niveau enumerees`)

// window-filter.ts n'est pas importable depuis un .mjs sans transpilation, et
// il est deja couvert par vitest. Ce qu'on prouve ici est complementaire : que
// le sidecar fournit reellement TOUS les attributs dont le filtre a besoin.
const REQUIRED = [
  'hwnd', 'pid', 'exeName', 'title', 'className', 'exStyle', 'style',
  'hasOwner', 'cloaked', 'visible', 'elevated', 'processCreatedAt',
  'showState', 'bounds',
]
const first = windows[0]
const missing = first ? REQUIRED.filter((k) => !(k in first)) : REQUIRED
say(missing.length === 0 ? 'PASS tous les attributs presents' : `ECHEC champs manquants : ${missing}`)

const withTitle = windows.filter((w) => w.title.trim().length > 0)
say(`${withTitle.length} fenetre(s) avec un titre`)
for (const w of withTitle.slice(0, 5)) {
  say(`   ${w.exeName} | "${w.title}" | ${w.className} | ${w.showState} | ` +
      `${w.bounds.left},${w.bounds.top} ${w.bounds.right - w.bounds.left}x${w.bounds.bottom - w.bounds.top}` +
      `${w.elevated ? ' | ELEVEE' : ''}`)
}

// Preuve du bug 5 : aucune fenetre non minimisee ne doit rapporter -32000.
const sentinels = withTitle.filter(
  (w) => w.showState !== 'minimized' && (w.bounds.left <= -30000 || w.bounds.top <= -30000),
)
say(sentinels.length === 0
  ? 'PASS aucune bounds sentinelle sur une fenetre non minimisee'
  : `ATTENTION ${sentinels.length} fenetre(s) suspecte(s)`)

// Preuve du hwnd en chaine : une valeur numerique perdrait de la precision.
say(typeof first?.hwnd === 'string' ? 'PASS hwnd transporte en chaine' : 'ECHEC hwnd numerique')
say(typeof first?.processCreatedAt === 'string'
  ? 'PASS processCreatedAt transporte en chaine'
  : 'ECHEC processCreatedAt numerique')
```

Renuméroter la section suivante en `=== PREUVE 4 : arret voulu, sortie propre ===`.

- [ ] **Step 4 : Exécuter la preuve**

Ouvrir d'abord deux ou trois applications visibles (dont une minimisée), puis :

```bash
node scripts/sidecar-smoke.mjs
```

Attendu : un nombre non nul de fenêtres, tous les attributs présents, les
applications ouvertes visibles dans la liste avec des bounds plausibles, et les
quatre `PASS`.

- [ ] **Step 5 : Commit**

```bash
git add native/vethos-probe/src/win_windows.cpp scripts/sidecar-smoke.mjs
git commit -m "feat(sidecar): enumeration reelle des fenetres avec bounds DWM et elevation"
```

---

### Task 6 : Journal de restauration sur disque

Troisième garantie du §5 de la spec, celle qui couvre la mort simultanée des
deux processus. C'est la réponse de fond aux bugs 1 et 2 : au démarrage suivant,
Vethos sait exactement quelles fenêtres il avait touchées et dans quel état les
remettre. L'appariement se fait sur `(pid, processCreatedAt)` et non sur le seul
PID, que Windows réutilise.

**Files:**
- Create: `src/main/blocking/journal.ts`
- Create: `src/main/blocking/journal.test.ts`

**Interfaces:**
- Consumes: `ShowState` de `./geometry` (Task 4).
- Produces: types `JournalEntry`, `Journal`, `LiveProcess` ; fonctions `encodeJournal`, `decodeJournal`, `planReplay`, `emptyJournal`, `upsertEntry`, `removeEntry`. Consommé par le contrôleur du Plan B et par le démarrage dans `src/main/index.ts`.

- [ ] **Step 1 : Écrire le test**

Créer `src/main/blocking/journal.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  decodeJournal,
  emptyJournal,
  encodeJournal,
  planReplay,
  removeEntry,
  upsertEntry,
  type Journal,
  type JournalEntry,
} from './journal'

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    hwnd: '1000',
    pid: 42,
    exeName: 'blender.exe',
    processCreatedAt: '133700000000000000',
    taskbarWasVisible: true,
    originalShowState: 'normal',
    audioWasMuted: false,
    ...overrides,
  }
}

describe('encodeJournal / decodeJournal', () => {
  it('fait un aller-retour sans perte', () => {
    const journal: Journal = {
      version: 1,
      sessionStartedAt: '2026-07-28T09:00:00.000Z',
      entries: [makeEntry(), makeEntry({ hwnd: '2000', pid: 43 })],
    }
    const decoded = decodeJournal(encodeJournal(journal))
    expect(decoded).toEqual(journal)
  })

  it('renvoie null sur du JSON invalide plutôt que de lever', () => {
    expect(decodeJournal('pas du json')).toBeNull()
    expect(decodeJournal('')).toBeNull()
  })

  it('renvoie null sur une version inconnue — jamais deviner un format', () => {
    expect(decodeJournal('{"version":99,"sessionStartedAt":"x","entries":[]}')).toBeNull()
  })

  it('renvoie null si entries n’est pas un tableau', () => {
    expect(decodeJournal('{"version":1,"sessionStartedAt":"x","entries":{}}')).toBeNull()
  })

  it('écarte une entrée malformée sans jeter tout le journal', () => {
    const raw = JSON.stringify({
      version: 1,
      sessionStartedAt: '2026-07-28T09:00:00.000Z',
      entries: [makeEntry(), { hwnd: 12 }, { pasDuTout: true }],
    })
    const decoded = decodeJournal(raw)
    expect(decoded?.entries).toHaveLength(1)
    expect(decoded?.entries[0]?.hwnd).toBe('1000')
  })
})

describe('planReplay', () => {
  const journal: Journal = {
    version: 1,
    sessionStartedAt: '2026-07-28T09:00:00.000Z',
    entries: [
      makeEntry({ hwnd: '1000', pid: 42, processCreatedAt: '111' }),
      makeEntry({ hwnd: '2000', pid: 43, processCreatedAt: '222' }),
      makeEntry({ hwnd: '3000', pid: 44, processCreatedAt: '333' }),
    ],
  }

  it('retient les entrées dont le processus est toujours vivant', () => {
    const plan = planReplay(journal, [
      { pid: 42, processCreatedAt: '111' },
      { pid: 44, processCreatedAt: '333' },
    ])
    expect(plan.map((e) => e.hwnd)).toEqual(['1000', '3000'])
  })

  it('écarte un PID réutilisé par un autre processus', () => {
    // Meme PID, heure de creation differente : Windows a recycle le PID.
    // Restaurer ici toucherait un processus etranger.
    const plan = planReplay(journal, [{ pid: 42, processCreatedAt: '999' }])
    expect(plan).toEqual([])
  })

  it('écarte les processus disparus', () => {
    expect(planReplay(journal, [])).toEqual([])
  })

  it('gère un journal vide', () => {
    expect(planReplay(emptyJournal('2026-07-28T09:00:00.000Z'), [{ pid: 1, processCreatedAt: '1' }])).toEqual([])
  })
})

describe('upsertEntry / removeEntry', () => {
  it('ajoute une entrée absente', () => {
    const journal = upsertEntry(emptyJournal('x'), makeEntry())
    expect(journal.entries).toHaveLength(1)
  })

  it('ne réécrit pas une entrée existante — la première capture fait foi', () => {
    // Sinon on memoriserait l'etat DEJA modifie et la restauration serait fausse.
    const first = upsertEntry(emptyJournal('x'), makeEntry({ taskbarWasVisible: true }))
    const second = upsertEntry(first, makeEntry({ taskbarWasVisible: false }))
    expect(second.entries).toHaveLength(1)
    expect(second.entries[0]?.taskbarWasVisible).toBe(true)
  })

  it('retire une entrée par hwnd', () => {
    const journal = upsertEntry(upsertEntry(emptyJournal('x'), makeEntry()), makeEntry({ hwnd: '2000' }))
    const after = removeEntry(journal, '1000')
    expect(after.entries.map((e) => e.hwnd)).toEqual(['2000'])
  })

  it('ignore le retrait d’un hwnd absent', () => {
    const journal = upsertEntry(emptyJournal('x'), makeEntry())
    expect(removeEntry(journal, 'inconnu').entries).toHaveLength(1)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/main/blocking/journal.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./journal"`.

- [ ] **Step 3 : Implémenter le journal**

Créer `src/main/blocking/journal.ts` :

```ts
import type { ShowState } from './geometry'

/**
 * Journal de restauration écrit sur disque avant chaque mutation de fenêtre.
 *
 * Troisième garantie du §5 de la spec, celle qui couvre la mort simultanée de
 * Vethos et du sidecar — coupure de courant, arrêt de l'arborescence depuis le
 * Gestionnaire des tâches. Au démarrage suivant, Vethos rejoue ce journal.
 *
 * C'est la réponse de fond aux bugs 1 et 2 : plus aucune fenêtre ne peut
 * rester piégée, quel que soit le mode d'arrêt.
 *
 * L'appariement se fait sur `(pid, processCreatedAt)` : Windows réutilise les
 * PID, et restaurer sur un simple PID toucherait un processus étranger.
 */

export type JournalEntry = {
  hwnd: string
  pid: number
  exeName: string
  processCreatedAt: string
  taskbarWasVisible: boolean
  originalShowState: ShowState
  audioWasMuted: boolean
}

export type Journal = {
  version: 1
  sessionStartedAt: string
  entries: JournalEntry[]
}

export type LiveProcess = { pid: number; processCreatedAt: string }

const SHOW_STATES: readonly ShowState[] = ['normal', 'minimized', 'maximized']

export function emptyJournal(sessionStartedAt: string): Journal {
  return { version: 1, sessionStartedAt, entries: [] }
}

export function encodeJournal(journal: Journal): string {
  return JSON.stringify(journal)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEntry(raw: unknown): JournalEntry | null {
  if (!isRecord(raw)) return null
  const { hwnd, pid, exeName, processCreatedAt, taskbarWasVisible, originalShowState, audioWasMuted } =
    raw
  if (typeof hwnd !== 'string' || hwnd.length === 0) return null
  if (typeof pid !== 'number' || !Number.isFinite(pid)) return null
  if (typeof exeName !== 'string') return null
  if (typeof processCreatedAt !== 'string') return null
  if (typeof taskbarWasVisible !== 'boolean') return null
  if (typeof audioWasMuted !== 'boolean') return null
  if (typeof originalShowState !== 'string') return null
  if (!SHOW_STATES.includes(originalShowState as ShowState)) return null
  return {
    hwnd,
    pid,
    exeName,
    processCreatedAt,
    taskbarWasVisible,
    originalShowState: originalShowState as ShowState,
    audioWasMuted,
  }
}

/** Renvoie `null` si le journal est illisible ou d'une version inconnue. */
export function decodeJournal(raw: string): Journal | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (parsed['version'] !== 1) return null
  const sessionStartedAt = parsed['sessionStartedAt']
  if (typeof sessionStartedAt !== 'string') return null
  const rawEntries = parsed['entries']
  if (!Array.isArray(rawEntries)) return null

  const entries: JournalEntry[] = []
  for (const candidate of rawEntries) {
    const entry = parseEntry(candidate)
    // Une entree corrompue est ecartee ; le reste du journal reste exploitable.
    if (entry !== null) entries.push(entry)
  }
  return { version: 1, sessionStartedAt, entries }
}

/** La première capture fait foi : réécrire mémoriserait un état déjà modifié. */
export function upsertEntry(journal: Journal, entry: JournalEntry): Journal {
  if (journal.entries.some((existing) => existing.hwnd === entry.hwnd)) return journal
  return { ...journal, entries: [...journal.entries, entry] }
}

export function removeEntry(journal: Journal, hwnd: string): Journal {
  return { ...journal, entries: journal.entries.filter((entry) => entry.hwnd !== hwnd) }
}

/** Entrées à restaurer : celles dont le processus d'origine tourne encore. */
export function planReplay(journal: Journal, alive: readonly LiveProcess[]): JournalEntry[] {
  const key = (pid: number, createdAt: string): string => `${pid}:${createdAt}`
  const liveKeys = new Set(alive.map((p) => key(p.pid, p.processCreatedAt)))
  return journal.entries.filter((entry) => liveKeys.has(key(entry.pid, entry.processCreatedAt)))
}
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/main/blocking/journal.test.ts
```

Attendu : `Tests 13 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/main/blocking/journal.ts src/main/blocking/journal.test.ts
git commit -m "feat(blocking): journal de restauration disque — correctif des bugs 1 et 2"
```

---

### Task 7 : Death-watch et distinction arrêt voulu / arrêt subi

Dernière pièce de la fondation. Le sidecar surveille le processus parent ; s'il
meurt sans prévenir, le sidecar restaure tout puis relance Vethos. Si l'arrêt
est voulu (`shutdown`), il restaure et sort sans relancer — sans cette
distinction, quitter proprement Vethos hors session le ferait ressusciter en
boucle (§5.2 de la spec).

**Files:**
- Modify: `native/vethos-probe/src/main.cpp`
- Modify: `src/main/blocking/protocol.ts` (ajout d'une commande)
- Modify: `src/main/blocking/protocol.test.ts` (test de la nouvelle commande)
- Modify: `scripts/sidecar-smoke.mjs` (deux preuves supplémentaires)

**Interfaces:**
- Consumes: `vethos::UndoLog` (Task 2), `SidecarCommand` (Task 2).
- Produces: commande `arm-relaunch { exePath: string | null }` ; le sidecar relance `exePath` à la mort subie du parent, et ne relance rien si `exePath` est `null` ou si `shutdown` a été reçu.

- [ ] **Step 1 : Écrire le test de la nouvelle commande**

Ajouter à `src/main/blocking/protocol.test.ts`, dans le bloc `describe('encodeCommand', ...)` :

```ts
  it('sérialise l’armement de la relance', () => {
    const line = encodeCommand({ id: 9, cmd: 'arm-relaunch', exePath: 'C:\\App\\Vethos.exe' })
    expect(JSON.parse(line)).toEqual({ id: 9, cmd: 'arm-relaunch', exePath: 'C:\\App\\Vethos.exe' })
  })

  it('sérialise le désarmement de la relance', () => {
    const line = encodeCommand({ id: 10, cmd: 'arm-relaunch', exePath: null })
    expect(JSON.parse(line)).toEqual({ id: 10, cmd: 'arm-relaunch', exePath: null })
  })
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/main/blocking/protocol.test.ts
```

Attendu : ÉCHEC de typecheck vitest — `Type '"arm-relaunch"' is not assignable`.

- [ ] **Step 3 : Étendre le type de commande**

Dans `src/main/blocking/protocol.ts`, ajouter cette variante à `SidecarCommand`,
après la ligne `| { id: number; cmd: 'release-all' }` :

```ts
  | { id: number; cmd: 'arm-relaunch'; exePath: string | null }
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

```bash
npx vitest run src/main/blocking/protocol.test.ts
```

Attendu : `Tests 10 passed`.

- [ ] **Step 5 : Implémenter le death-watch dans le sidecar**

Dans `native/vethos-probe/src/main.cpp`, remplacer le bloc `namespace { ... }`
d'ouverture — les déclarations globales — par celui-ci :

```cpp
namespace {

vethos::UndoLog g_undoLog;
bool g_shuttingDown = false;
std::string g_relaunchExePath;  // vide = relance desarmee
HANDLE g_parentProcess = nullptr;

void emit(const std::string& line) {
  std::fwrite(line.data(), 1, line.size(), stdout);
  std::fwrite("\n", 1, 1, stdout);
  std::fflush(stdout);
}

void trace(const std::string& message) {
  std::fprintf(stderr, "[probe] %s\n", message.c_str());
  std::fflush(stderr);
}

// Restaure tout, puis relance Vethos si et seulement si la relance est armee
// ET que l'arret n'a pas ete demande explicitement.
void restoreAndMaybeRelaunch(const char* cause) {
  const std::vector<std::string> restored = g_undoLog.restoreAll();
  trace(std::string("annulation (") + cause + ") : " + std::to_string(restored.size()) +
        " fenetre(s) restauree(s)");

  if (g_shuttingDown) {
    trace("arret voulu : aucune relance");
    return;
  }
  if (g_relaunchExePath.empty()) {
    trace("relance desarmee : aucune relance");
    return;
  }

  trace("relance de " + g_relaunchExePath);
  STARTUPINFOA startup = {};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION info = {};
  std::string commandLine = "\"" + g_relaunchExePath + "\"";
  const BOOL ok = CreateProcessA(nullptr, commandLine.data(), nullptr, nullptr, FALSE,
                                 CREATE_NO_WINDOW | DETACHED_PROCESS, nullptr, nullptr, &startup,
                                 &info);
  if (ok) {
    CloseHandle(info.hProcess);
    CloseHandle(info.hThread);
    trace("relance lancee");
  } else {
    trace("echec de la relance, code " + std::to_string(GetLastError()));
  }
}

// Attend la mort du parent dans un thread dedie. Le flux stdin peut rester
// ouvert alors que le parent est deja mort : les deux signaux sont necessaires.
DWORD WINAPI watchParent(LPVOID) {
  if (g_parentProcess == nullptr) return 0;
  WaitForSingleObject(g_parentProcess, INFINITE);
  if (g_shuttingDown) return 0;  // le shutdown a gagne la course
  trace("parent disparu sans prevenir");
  restoreAndMaybeRelaunch("mort du parent");
  // On sort du processus : plus personne pour nous piloter.
  ExitProcess(0);
}

std::string replyError(double id, const std::string& message) {
  return vethos::JsonOut().num("id", id).boolean("ok", false).str("error", message).done();
}

std::string handleCommand(const vethos::JsonValue& command) {
```

Puis, dans `handleCommand`, ajouter cette branche juste avant le `return
replyError(id, "commande inconnue : " + cmd);` final :

```cpp
  if (cmd == "arm-relaunch") {
    const vethos::JsonValue* pathValue = command.find("exePath");
    if (pathValue != nullptr && pathValue->type == vethos::JsonType::String) {
      g_relaunchExePath = pathValue->str;
      trace("relance armee sur " + g_relaunchExePath);
    } else {
      g_relaunchExePath.clear();
      trace("relance desarmee");
    }
    return vethos::JsonOut()
        .num("id", id)
        .boolean("ok", true)
        .boolean("armed", !g_relaunchExePath.empty())
        .done();
  }

```

> La fonction `replyOk` du squelette de la Task 2 n'est utilisée nulle part —
> la supprimer plutôt que de la laisser en place, `/W4` la signalerait.

Enfin, remplacer la fin de `main` — depuis la déclaration de `parentPid` jusqu'au
`return 0;` — par :

```cpp
  unsigned long parentPid = 0;
  for (int k = 1; k < argc; ++k) {
    const std::string arg = argv[k];
    if (arg == "--parent-pid" && k + 1 < argc) {
      parentPid = std::strtoul(argv[k + 1], nullptr, 10);
      ++k;
    }
  }
  trace("demarre pid=" + std::to_string(GetCurrentProcessId()) +
        " parent=" + std::to_string(parentPid));

  if (parentPid != 0) {
    g_parentProcess = OpenProcess(SYNCHRONIZE, FALSE, parentPid);
    if (g_parentProcess != nullptr) {
      CloseHandle(CreateThread(nullptr, 0, watchParent, nullptr, 0, nullptr));
    } else {
      trace("impossible de surveiller le parent, code " + std::to_string(GetLastError()));
    }
  }

  std::string line;
  while (!g_shuttingDown && std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.empty()) continue;

    vethos::JsonValue command;
    if (!vethos::parseJson(line, command)) {
      emit(vethos::JsonOut().num("id", -1).boolean("ok", false).str("error", "json illisible").done());
      continue;
    }
    emit(handleCommand(command));
  }

  // Sortie par EOF de stdin ou par shutdown explicite.
  restoreAndMaybeRelaunch(g_shuttingDown ? "shutdown" : "eof stdin");
  if (g_parentProcess != nullptr) CloseHandle(g_parentProcess);
  return 0;
}
```

- [ ] **Step 6 : Recompiler**

```bash
npm run build:sidecar
```

Attendu : compilation sans erreur.

- [ ] **Step 7 : Ajouter les preuves du death-watch**

Créer `scripts/sidecar-deathwatch-smoke.mjs`. Ce scénario a besoin d'un processus
parent sacrifiable, donc il vit dans son propre fichier.

```js
// Preuve du death-watch : la relance ne se declenche QUE sur une mort subie.
//
//   node scripts/sidecar-deathwatch-smoke.mjs
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXE = join(ROOT, 'resources', 'sidecar', 'vethos-probe.exe')
if (!existsSync(EXE)) {
  console.error(`Sidecar absent : ${EXE}\nLance d'abord "npm run build:sidecar".`)
  process.exit(1)
}

const t0 = Date.now()
const say = (m) => console.log(`+${String(Date.now() - t0).padStart(5, ' ')}ms  ${m}`)

// Cible de relance inoffensive : un .bat qui ecrit un fichier temoin.
const work = mkdtempSync(join(tmpdir(), 'vethos-dw-'))
const witness = join(work, 'temoin.txt')
const fakeApp = join(work, 'fausse-vethos.bat')
writeFileSync(fakeApp, `@echo off\r\necho relance>"${witness}"\r\n`, 'utf8')

function launchProbe(label) {
  const child = spawn(EXE, ['--parent-pid', String(process.pid)], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
  })
  createInterface({ input: child.stderr }).on('line', (l) => say(`   [${label}] ${l}`))
  const replies = new Map()
  let nextId = 1
  createInterface({ input: child.stdout }).on('line', (line) => {
    say(`<- [${label}] ${line}`)
    try {
      const msg = JSON.parse(line)
      if (replies.has(msg.id)) { replies.get(msg.id)(msg); replies.delete(msg.id) }
    } catch { /* trace */ }
  })
  const send = (cmd) => {
    const id = nextId++
    child.stdin.write(`${JSON.stringify({ id, ...cmd })}\n`)
    return new Promise((res) => replies.set(id, res))
  }
  return { child, send }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const witnessExists = () => existsSync(witness)

say('=== PREUVE A : shutdown => restauration, PAS de relance ===')
{
  const { child, send } = launchProbe('A')
  await send({ cmd: 'ping' })
  await send({ cmd: 'arm-relaunch', exePath: fakeApp })
  await send({ cmd: 'shutdown' })
  child.stdin.end()
  await new Promise((r) => child.on('exit', r))
  await sleep(700)
  say(witnessExists() ? 'ECHEC relance declenchee sur un arret voulu' : 'PASS aucune relance sur shutdown')
}

say('=== PREUVE B : relance desarmee => EOF ne relance rien ===')
{
  const { child, send } = launchProbe('B')
  await send({ cmd: 'ping' })
  await send({ cmd: 'arm-relaunch', exePath: null })
  child.stdin.end()
  await new Promise((r) => child.on('exit', r))
  await sleep(700)
  say(witnessExists() ? 'ECHEC relance sur desarme' : 'PASS aucune relance quand desarme')
}

say('=== PREUVE C : mort subie du parent => restauration ET relance ===')
{
  // Un parent intermediaire qu'on tue brutalement, pour reproduire un kill
  // depuis le Gestionnaire des taches.
  const runner = join(work, 'parent.mjs')
  writeFileSync(runner, `
import { spawn } from 'node:child_process'
const child = spawn(${JSON.stringify(EXE)}, ['--parent-pid', String(process.pid)], {
  windowsHide: true, stdio: ['pipe','pipe','pipe'], shell: false, detached: false,
})
child.stdin.write(JSON.stringify({ id: 1, cmd: 'arm-relaunch', exePath: ${JSON.stringify(fakeApp)} }) + '\\n')
setTimeout(() => {}, 60000)
`, 'utf8')

  const parent = spawn(process.execPath, [runner], { windowsHide: true, stdio: 'ignore' })
  await sleep(1200)
  say(`parent intermediaire pid=${parent.pid}, on le tue brutalement`)
  spawn('taskkill', ['/PID', String(parent.pid), '/T', '/F'], { windowsHide: true })
  await sleep(2500)
  say(witnessExists() ? 'PASS relance declenchee sur mort subie' : 'ECHEC aucune relance sur mort subie')
}

say(`dossier de travail : ${work}`)
```

- [ ] **Step 8 : Exécuter les preuves du death-watch**

```bash
node scripts/sidecar-deathwatch-smoke.mjs
```

Attendu : `PASS aucune relance sur shutdown`, `PASS aucune relance quand
desarme`, `PASS relance declenchee sur mort subie`. Les traces stderr du sidecar
doivent montrer `arret voulu : aucune relance` pour A et `parent disparu sans
prevenir` pour C.

- [ ] **Step 9 : Vérifier la suite complète et le typecheck**

```bash
npx vitest run && npm run typecheck:node
```

Attendu : `Tests 249 passed` — 206 de référence, plus 10 (`protocol`), 11
(`window-filter`), 9 (`geometry`), 13 (`journal`). `typecheck:node` vert.

- [ ] **Step 10 : Ajouter le dossier de build à .gitignore**

Ajouter à `.gitignore`, après la ligne `out/` :

```
native/vethos-probe/obj/
```

`resources/` est déjà ignoré : le binaire compilé n'entre pas dans git, il est
produit par `npm run build:sidecar`.

- [ ] **Step 11 : Commit**

```bash
git add native/vethos-probe/src/main.cpp src/main/blocking/protocol.ts src/main/blocking/protocol.test.ts scripts/sidecar-deathwatch-smoke.mjs .gitignore
git commit -m "feat(sidecar): death-watch avec distinction arret voulu / arret subi"
```

---

## Ce que ce plan livre

À la fin du Plan A, le pont natif est réel et prouvé :

- un sidecar C++ de ~140 Ko sans aucune dépendance runtime, compilé par `npm run build:sidecar` ;
- un protocole JSONL testé des deux côtés, avec les valeurs 64 bits transportées en chaînes ;
- l'énumération réelle des fenêtres avec bounds DWM, élévation et heure de création des processus ;
- les trois correctifs de logique pure — bug 4 (prédicat de fenêtre), bug 5 (placement), bugs 1 et 2 (journal) — chacun avec ses tests ;
- la garantie qu'aucune fenêtre ne peut être piégée, prouvée sur les trois modes d'arrêt.

Aucune fenêtre n'est encore masquée ni recouverte — c'est le Plan B.

## Ce que ce plan ne livre pas

Volontairement hors périmètre, traité dans les plans suivants :

- **Plan B** — overlay attaché et gestionnaire multi-overlay, masquage de la barre des tâches et cas UIPI, contrôle audio WASAPI, minimiser, maximiser, fermer.
- **Plan C** — zone de notification et lancement au démarrage, horloge de réconciliation et créneaux récurrents, page Blocage, justification IA.
