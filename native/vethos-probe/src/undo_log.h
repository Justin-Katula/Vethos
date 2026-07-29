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
