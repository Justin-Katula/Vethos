"""
Tournage de la vraie app (web Expo, localhost:8081) image par image.

L'horloge de la page est pilotée (Playwright `clock`) : chaque image avance le
temps de 1/30 s exactement, quelle que soit la lenteur de la capture. Les
animations restent donc parfaitement fluides, à la résolution d'un iPhone (×3).

Usage :
  python tournage.py essai            → quelques images fixes dans essai/
  python tournage.py <plan>           → plans/<plan>/00000.jpg …  (voir PLANS)
"""
import os
import sys
import time
from datetime import datetime

from playwright.sync_api import sync_playwright

ICI = os.path.dirname(os.path.abspath(__file__))
URL = 'http://localhost:8081'
VUE = {'width': 390, 'height': 844}
ECHELLE = 3
FPS = 30


def ouvrir(p, etat=None):
    nav = p.chromium.launch(channel='chrome', headless=True)
    ctx = nav.new_context(viewport=VUE, device_scale_factor=ECHELLE, is_mobile=True, has_touch=True,
                          locale='en-US', timezone_id='America/Regina', color_scheme='dark',
                          **({'storage_state': etat} if etat else {}))
    page = ctx.new_page()
    return nav, ctx, page


class Camera:
    def __init__(self, page, dossier):
        self.page = page
        self.dossier = dossier
        os.makedirs(dossier, exist_ok=True)
        self.n = 0

    def filmer(self, secondes):
        for _ in range(int(secondes * FPS)):
            self.page.clock.run_for(int(1000 / FPS))
            self.page.screenshot(path=os.path.join(self.dossier, f'{self.n:05d}.jpg'), type='jpeg', quality=92)
            self.n += 1

    def attendre(self, secondes):
        """Avance le temps sans filmer (chargement, transitions qu'on coupe)."""
        self.page.clock.run_for(int(secondes * 1000))


def essai():
    with sync_playwright() as p:
        nav, ctx, page = ouvrir(p)
        page.clock.install(time=datetime.fromisoformat(os.environ.get('HEURE', '2026-10-23T19:30:00')))
        page.goto(URL, wait_until='domcontentloaded')
        # Le bundle charge en temps réel ; l'horloge de la page avance par pas.
        os.makedirs(os.path.join(ICI, 'essai'), exist_ok=True)
        for i in range(12):
            time.sleep(1.0)
            page.clock.run_for(1000)
            page.screenshot(path=os.path.join(ICI, 'essai', f'{i:02d}.jpg'), type='jpeg', quality=80)
        print(page.url)
        nav.close()


def tourner():
    from etapes import ETAPES, jouer
    plans = os.path.join(ICI, 'plans')
    with sync_playwright() as p:
        nav, ctx, page = ouvrir(p)
        # L'heure du tournage fixe la lumière de l'app (le soir : chaud).
        page.clock.install(time=datetime.fromisoformat(os.environ.get('HEURE', '2026-10-23T19:30:00')))
        page.goto(URL, wait_until='domcontentloaded')
        page.wait_for_timeout(8000)
        page.clock.run_for(4000)

        def filmer(nom, secondes):
            cam = Camera(page, os.path.join(plans, nom))
            t0 = time.time()
            cam.filmer(secondes)
            print(f'{nom}: {cam.n} images en {time.time() - t0:.0f} s', flush=True)

        jouer(page, ETAPES, filmer=filmer)
        nav.close()


if __name__ == '__main__':
    if sys.argv[1:] == ['essai']:
        essai()
    else:
        tourner()
