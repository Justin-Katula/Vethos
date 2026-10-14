import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI

/// Les apps, catégories et sites d'une liste de blocage, montrés DANS
/// l'interface de Vethos — et modifiables un par un.
///
/// iOS ne donne à l'app que des jetons opaques : le code ne lit jamais un nom.
/// Mais SwiftUI sait les DESSINER (`Label(jeton)`) — icône et nom réels, rendus
/// par le système. L'utilisateur voit « Games » ou « Instagram » ; Vethos, lui,
/// ne voit que des pixels qu'il ne peut pas lire.
///
/// Les sélections vivent là où `react-native-device-activity` les range :
/// l'App Group, clé `familyActivitySelectionIds`, sous un identifiant.
public class VethosJetonsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VethosJetons")

    /// Monte à chaque changement de la vue native : le JS ne la dessine que si
    /// la build installée parle la même langue (le JS arrive par Metro, le natif par EAS).
    Function("version") { () -> Int in
      2
    }

    /// Les comptes d'une sélection rangée.
    Function("compter") { (id: String) -> [String: Int] in
      comptes(selectionRangee(id))
    }

    /// Vide une sélection (celle d'un ajout, avant d'ouvrir le sélecteur d'Apple).
    Function("vider") { (id: String) in
      ranger(FamilyActivitySelection(), sous: id)
    }

    /// Ajoute à `cible` tout ce qui est dans `ajout`, puis vide `ajout`. Rend les comptes de `cible`.
    /// C'est ainsi que « + » n'ajoute que : le sélecteur s'ouvre vide, rien ne peut s'y décocher.
    Function("fusionner") { (cible: String, ajout: String) -> [String: Int] in
      var s = selectionRangee(cible)
      let a = selectionRangee(ajout)
      s.applicationTokens.formUnion(a.applicationTokens)
      s.categoryTokens.formUnion(a.categoryTokens)
      s.webDomainTokens.formUnion(a.webDomainTokens)
      ranger(s, sous: cible)
      ranger(FamilyActivitySelection(), sous: ajout)
      return comptes(s)
    }

    View(VethosJetonsVue.self) {
      Events("onRetrait")

      Prop("selectionId") { (vue: VethosJetonsVue, id: String) in
        vue.modele.selectionId = id
      }
      // Changer la sélection garde le même identifiant : ce compteur force la relecture.
      Prop("version") { (vue: VethosJetonsVue, v: Int) in
        vue.modele.version = v
      }
      Prop("couleur") { (vue: VethosJetonsVue, c: UIColor) in
        vue.modele.couleur = Color(c)
      }
      Prop("taillePolice") { (vue: VethosJetonsVue, t: Double) in
        vue.modele.taille = t
      }
      /// Un « × » par élément pour le retirer. Faux pendant une séance.
      Prop("modifiable") { (vue: VethosJetonsVue, m: Bool) in
        vue.modele.modifiable = m
      }
    }
  }
}

let CLE_SELECTIONS = "familyActivitySelectionIds"

func defauts() -> UserDefaults? {
  let groupe = Bundle.main.object(forInfoDictionaryKey: "REACT_NATIVE_DEVICE_ACTIVITY_APP_GROUP") as? String
  return UserDefaults(suiteName: groupe)
}

/// La sélection rangée sous cet identifiant, ou une sélection vide.
func selectionRangee(_ id: String) -> FamilyActivitySelection {
  guard
    let brut = defauts()?.dictionary(forKey: CLE_SELECTIONS)?[id] as? String,
    let donnees = Data(base64Encoded: brut),
    let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: donnees)
  else { return FamilyActivitySelection() }
  return selection
}

/// Range une sélection sous un identifiant, au même format que la bibliothèque.
func ranger(_ s: FamilyActivitySelection, sous id: String) {
  guard let d = defauts(), let donnees = try? JSONEncoder().encode(s) else { return }
  var tout = d.dictionary(forKey: CLE_SELECTIONS) ?? [:]
  tout[id] = donnees.base64EncodedString()
  d.set(tout, forKey: CLE_SELECTIONS)
}

func comptes(_ s: FamilyActivitySelection) -> [String: Int] {
  [
    "applicationCount": s.applicationTokens.count,
    "categoryCount": s.categoryTokens.count,
    "webDomainCount": s.webDomainTokens.count,
  ]
}

final class ModeleJetons: ObservableObject {
  @Published var selectionId = ""
  @Published var version = 0
  @Published var couleur = Color.white
  @Published var taille: Double = 16
  @Published var modifiable = false
  /// Relu après un retrait fait ici même.
  @Published var revision = 0
}

public class VethosJetonsVue: ExpoView {
  let modele = ModeleJetons()
  let onRetrait = EventDispatcher()
  private var hote: UIHostingController<ListeJetons>!

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    hote = UIHostingController(rootView: ListeJetons(modele: modele, retire: { [weak self] c in self?.onRetrait(c) }))
    hote.view.backgroundColor = .clear
    clipsToBounds = true
    addSubview(hote.view)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    hote.view.frame = bounds
  }
}

/// Un élément de la liste : le jeton, et comment le retirer de la sélection.
enum Element: Hashable {
  case categorie(ActivityCategoryToken)
  case application(ApplicationToken)
  case site(WebDomainToken)
}

struct ListeJetons: View {
  @ObservedObject var modele: ModeleJetons
  let retire: ([String: Int]) -> Void

  var body: some View {
    // `version` et `revision` sont lus pour que SwiftUI redessine quand la sélection change.
    let _ = (modele.version, modele.revision)
    let s = selectionRangee(modele.selectionId)
    let elements: [Element] =
      s.categoryTokens.map { .categorie($0) } + s.applicationTokens.map { .application($0) } + s.webDomainTokens.map { .site($0) }
    VStack(alignment: .leading, spacing: 12) {
      ForEach(elements, id: \.self) { e in
        HStack(spacing: 10) {
          etiquette(e)
          Spacer(minLength: 8)
          if modele.modifiable {
            Button {
              retirer(e)
            } label: {
              Image(systemName: "xmark")
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 28, height: 28)
                .background(Circle().fill(Color.white.opacity(0.08)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove")
          }
        }
      }
    }
    .font(.system(size: modele.taille, weight: .medium))
    .foregroundColor(modele.couleur)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  @ViewBuilder
  func etiquette(_ e: Element) -> some View {
    switch e {
    case .categorie(let t): Label(t).labelStyle(.titleAndIcon)
    case .application(let t): Label(t).labelStyle(.titleAndIcon)
    case .site(let t): Label(t).labelStyle(.titleAndIcon)
    }
  }

  func retirer(_ e: Element) {
    var s = selectionRangee(modele.selectionId)
    switch e {
    case .categorie(let t): s.categoryTokens.remove(t)
    case .application(let t): s.applicationTokens.remove(t)
    case .site(let t): s.webDomainTokens.remove(t)
    }
    ranger(s, sous: modele.selectionId)
    modele.revision += 1
    retire(comptes(s))
  }
}
