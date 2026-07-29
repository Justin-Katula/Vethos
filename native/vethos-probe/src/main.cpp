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

#include <atomic>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>

#include "json.h"
#include "undo_log.h"
#include "win_windows.h"

namespace {

vethos::UndoLog g_undoLog;
// atomic : ecrit par le thread principal (branche shutdown de handleCommand),
// lu par watchParent sur un autre thread. Un bool brut serait une donnee
// partagee sans synchronisation — comportement indefini, et sous /O2 le
// compilateur peut legitimement garder la valeur en registre et ne jamais
// publier l'ecriture vers l'autre thread (finding 1 de la revue).
std::atomic<bool> g_shuttingDown{false};
std::string g_relaunchExePath;  // vide = relance desarmee
HANDLE g_parentProcess = nullptr;
// Garde one-shot : watchParent (mort du parent) et le thread principal (EOF
// stdin) peuvent tous deux atteindre restoreAndMaybeRelaunch pour la meme
// mort du parent.
//   - g_relaunchClaimed : echange atomique qui elit un unique gagnant, AVANT
//     tout travail (restauration ou relance).
//   - g_relaunchFinished : signale que le travail du gagnant est termine. Le
//     perdant l'attend avant de rendre la main a son appelant : sans cette
//     attente, cet appelant (watchParent, qui enchaine sur ExitProcess ; ou
//     main, qui enchaine sur son "return 0") pourrait terminer tout le
//     processus pendant que le gagnant est encore en plein CreateProcessW sur
//     l'autre thread — coupant la relance avant qu'elle ne parte reellement.
std::atomic<bool> g_relaunchClaimed{false};
std::atomic<bool> g_relaunchFinished{false};

void emit(const std::string& line) {
  std::fwrite(line.data(), 1, line.size(), stdout);
  std::fwrite("\n", 1, 1, stdout);
  std::fflush(stdout);
}

void trace(const std::string& message) {
  std::fprintf(stderr, "[probe] %s\n", message.c_str());
  std::fflush(stderr);
}

// Convertit de l'UTF-8 vers l'UTF-16. g_relaunchExePath contient de l'UTF-8
// (decode depuis la ligne JSONL), et CreateProcessW — seule a interpreter
// correctement un chemin hors CP1252, voir restoreAndMaybeRelaunch plus bas
// (finding 4 de la revue) — attend de l'UTF-16. MultiByteToWideChar refuse
// une longueur nulle (cbMultiByte == 0) : on court-circuite donc la chaine
// vide plutot que de la lui soumettre.
std::wstring toWide(const std::string& utf8) {
  if (utf8.empty()) return {};
  const int needed =
      MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
  if (needed <= 0) return {};
  std::wstring wide(static_cast<size_t>(needed), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), wide.data(), needed);
  return wide;
}

// Reveille l'eventuel perdant bloque dans restoreAndMaybeRelaunch (voir plus
// bas) et rend surs les deux appels a "terminer le processus" qui suivent
// immediatement restoreAndMaybeRelaunch chez les deux appelants (ExitProcess
// dans watchParent, "return 0" dans main) : par construction, aucun des deux
// ne peut plus s'executer avant que ce signal n'ait ete emis.
void signalRelaunchFinished() {
  g_relaunchFinished.store(true);
  g_relaunchFinished.notify_all();
}

// Garde RAII pour g_relaunchFinished : le destructeur signale la fin du
// travail du gagnant dans restoreAndMaybeRelaunch (plus bas), sur TOUTE
// sortie de la fonction — return normal ou deroulement de pile provoque par
// une exception sous /EHsc (par exemple une bad_alloc pendant restoreAll()
// ou pendant la construction de commandLine). Avant cette garde, la
// signalisation etait positionnelle : elle ne tenait que parce que chaque
// chemin de sortie pensait a appeler signalRelaunchFinished() explicitement,
// et une exception levee entre deux aurait saute l'appel, laissant le
// perdant bloque indefiniment dans g_relaunchFinished.wait(false)
// (amelioration mineure de la revue). Non copiable : une seule instance vit
// sur la pile de restoreAndMaybeRelaunch.
class RelaunchFinishedGuard {
 public:
  RelaunchFinishedGuard() = default;
  ~RelaunchFinishedGuard() { signalRelaunchFinished(); }
  RelaunchFinishedGuard(const RelaunchFinishedGuard&) = delete;
  RelaunchFinishedGuard& operator=(const RelaunchFinishedGuard&) = delete;
};

// Restaure tout, puis relance Vethos si et seulement si la relance est armee
// ET que l'arret n'a pas ete demande explicitement.
//
// Deux chemins independants peuvent appeler cette fonction pour la meme mort
// du parent : le thread watchParent (WaitForSingleObject) et le thread
// principal (EOF sur stdin). g_relaunchClaimed.exchange(true) revendique le
// droit d'executer le corps AVANT tout travail (restauration ou relance) : le
// premier thread a passer par l'echange recoit false et continue ; l'echange
// etant une seule instruction atomique, il n'existe aucun entrelacement ou
// les deux threads recoivent false.
//
// Le perdant (tout appel suivant, recevant true) n'attaque ni restauration ni
// relance, mais il ne peut pas non plus se contenter de "return" tout de
// suite : son appelant enchaine sur du code qui termine le processus entier
// (ExitProcess ou "return 0" depuis main), sans savoir si l'AUTRE thread — le
// gagnant — a fini son propre CreateProcessW. Le perdant attend donc
// g_relaunchFinished avant de rendre la main, pour que la relance du gagnant
// ait toujours le temps de partir avant que quiconque ne coupe le processus.
void restoreAndMaybeRelaunch(const char* cause) {
  if (g_relaunchClaimed.exchange(true)) {
    trace(std::string("annulation (") + cause +
          ") : deja prise en charge par un autre chemin, on attend sa fin");
    g_relaunchFinished.wait(false);
    return;
  }

  const RelaunchFinishedGuard finishedGuard;

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
  STARTUPINFOW startup = {};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION info = {};
  // g_relaunchExePath est de l'UTF-8 (decode depuis la ligne JSONL) : on le
  // convertit en UTF-16 via toWide() pour CreateProcessW, seule a
  // interpreter correctement un chemin hors CP1252 — la page de code ANSI
  // active n'a pas de manifeste UTF-8 (finding 4 de la revue).
  // CreateProcessW exige un buffer de ligne de commande mutable, d'ou
  // l'appel a .data() non-const plutot qu'a .c_str().
  std::wstring commandLine = L"\"" + toWide(g_relaunchExePath) + L"\"";
  const BOOL ok = CreateProcessW(nullptr, commandLine.data(), nullptr, nullptr, FALSE,
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
    // Arret VOULU : le drapeau est leve AVANT toute restauration. Si on
    // restaurait d'abord, une fenetre entre la fin de restoreAll() et la
    // levee du drapeau permettrait a watchParent de lire g_shuttingDown a
    // false si Vethos est tue de force a cet instant precis, et de relancer
    // a tort (finding 1 de la revue) : l'intention doit etre publiee avant
    // que le moindre travail ne commence, jamais apres.
    g_shuttingDown = true;
    const std::vector<std::string> restored = g_undoLog.restoreAll();
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
