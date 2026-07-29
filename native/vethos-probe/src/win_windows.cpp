#include "win_windows.h"

// windows.h definit sinon des macros max/min qui masquent std::max/std::min
// utilises plus bas (collision de preprocesseur, pas de logique).
#define NOMINMAX
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
