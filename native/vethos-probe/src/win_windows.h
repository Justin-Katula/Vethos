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
