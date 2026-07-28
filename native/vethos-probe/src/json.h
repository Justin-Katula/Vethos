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
