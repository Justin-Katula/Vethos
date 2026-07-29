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
