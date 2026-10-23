"""
Explore l'onboarding pas à pas : joue les ÉTAPES connues (à temps réel
accéléré), puis photographie l'écran atteint et liste ce qui est touchable.

  python explorer.py   → explore/ecran.jpg + la liste des textes cliquables
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

from tournage import ICI, URL, ouvrir
from etapes import ETAPES, jouer


def main():
    with sync_playwright() as p:
        nav, ctx, page = ouvrir(p)
        page.clock.install()
        page.goto(URL, wait_until='domcontentloaded')
        page.wait_for_timeout(8000)
        page.clock.run_for(4000)
        jouer(page, ETAPES, filmer=None)
        page.clock.run_for(3000)
        os.makedirs(os.path.join(ICI, 'explore'), exist_ok=True)
        page.screenshot(path=os.path.join(ICI, 'explore', 'ecran.jpg'), type='jpeg', quality=70, scale='css')
        touchables = page.evaluate("""() => [...document.querySelectorAll('[role=button],button,input,[role=checkbox],[role=radio],[role=slider],[tabindex]')]
          .filter(e => e.offsetParent !== null).map(e => ((e.getAttribute('aria-label')||'') + ' | ' + (e.innerText||'').trim().replace(/\\s+/g,' ')).slice(0,80))""")
        print(json.dumps(touchables[:60], ensure_ascii=False, indent=0))
        nav.close()


if __name__ == '__main__':
    main()
