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
