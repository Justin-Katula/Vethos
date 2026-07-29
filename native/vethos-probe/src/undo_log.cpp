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
