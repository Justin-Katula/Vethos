"""
Les gestes de l'onboarding, dans l'ordre. Chaque étape : (geste, cible, attente_s).
  geste : 'clic' (texte visible exact), 'clic_label' (aria-label), 'taper' (texte), 'attendre'
"""

ETAPES = [
    ('taper', 'Alex', 0.6),
    ('clic', 'Continue', 1.5),
    ('clic_label', 'School', 0.5),
    ('clic_label', 'A project', 0.5),
    ('clic', 'Continue', 1.5),
    ('clic_label', 'Almost every evening', 1.5),
    ('clic', 'Studying', 0.4),
    ('clic', 'Building the first version', 0.4),
    ('clic', 'the one', 1.5),
    ('clic', 'A year or more', 1.5),
    ('clic', 'Never', 1.5),
    ('clic', 'About 80 hours', 1.5),
    ('clic', 'My phone', 0.4),
    ('clic', 'Too tired by evening', 0.4),
    ('clic', 'Show me what it cost', 0.0),
    ('film', 'calendrier', 13.0),
    ('clic', 'Show me the next one', 14.0),
    ('clic', 'Show me all of it', 0.0),
    ('film', 'heures', 4.0),
    ('clic', 'want that', 0.0),
    ('film', 'demain', 5.0),
    ('clic', 'Not this time.', 0.0),
    ('film', 'vethos', 6.0),
    ('clic', 'Give Vethos one thing', 0.0),
    ('film', 'formes', 7.0),
    ('clic', 'Continue', 0.0),
    ('film', 'blocage', 1.5),
    ('clic', 'Lock my distractions', 0.0),
    ('film', 'blocage2', 4.5),
    ('clic', 'Continue', 2.0),
    ('clic', '18 – 24', 0.0),
    ('film', 'nuit', 3.0),
    ('clic', 'Keep this time for me', 2.0),
    ('clic', 'School', 1.2),
    ('clic', 'Find its place, Vethos', 0.0),
    ('film', 'place', 14.0),
]


def jouer(page, etapes, filmer=None):
    """Joue les étapes. `filmer(plan, secondes)` filme les étapes 'film' ; ailleurs l'horloge avance seule."""
    for geste, cible, attente in etapes:
        if geste == 'taper':
            page.keyboard.type(cible, delay=0)
        elif geste == 'clic':
            # Le texte visible ; à défaut, un bouton dont le nom le contient.
            loc = page.get_by_text(cible, exact=True)
            if loc.count() == 0:
                loc = page.get_by_role('button', name=cible)
            loc.last.click(force=True, timeout=5000)
        elif geste == 'clic_label':
            page.get_by_label(cible, exact=True).last.click(force=True)
        elif geste == 'attendre':
            pass
        elif geste == 'film':
            if filmer:
                filmer(cible, attente)
            else:
                page.clock.run_for(int(attente * 1000))
            continue
        page.clock.run_for(int(attente * 1000))
