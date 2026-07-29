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
bool g_shuttingDown = false;
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
//     processus pendant que le gagnant est encore en plein CreateProcessA sur
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

// Reveille l'eventuel perdant bloque dans restoreAndMaybeRelaunch (voir plus
// bas) et rend surs les deux appels a "terminer le processus" qui suivent
// immediatement restoreAndMaybeRelaunch chez les deux appelants (ExitProcess
// dans watchParent, "return 0" dans main) : par construction, aucun des deux
// ne peut plus s'executer avant que ce signal n'ait ete emis.
void signalRelaunchFinished() {
  g_relaunchFinished.store(true);
  g_relaunchFinished.notify_all();
}

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
// gagnant — a fini son propre CreateProcessA. Le perdant attend donc
// g_relaunchFinished avant de rendre la main, pour que la relance du gagnant
// ait toujours le temps de partir avant que quiconque ne coupe le processus.
void restoreAndMaybeRelaunch(const char* cause) {
  if (g_relaunchClaimed.exchange(true)) {
    trace(std::string("annulation (") + cause +
          ") : deja prise en charge par un autre chemin, on attend sa fin");
    g_relaunchFinished.wait(false);
    return;
  }

  const std::vector<std::string> restored = g_undoLog.restoreAll();
  trace(std::string("annulation (") + cause + ") : " + std::to_string(restored.size()) +
        " fenetre(s) restauree(s)");

  if (g_shuttingDown) {
    trace("arret voulu : aucune relance");
    signalRelaunchFinished();
    return;
  }
  if (g_relaunchExePath.empty()) {
    trace("relance desarmee : aucune relance");
    signalRelaunchFinished();
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
  signalRelaunchFinished();
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
