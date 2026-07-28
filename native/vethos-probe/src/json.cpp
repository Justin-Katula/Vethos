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
            for (const char h : hex) {
              const bool isHexDigit =
                  (h >= '0' && h <= '9') || (h >= 'a' && h <= 'f') || (h >= 'A' && h <= 'F');
              if (!isHexDigit) return false;
            }
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
