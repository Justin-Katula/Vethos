"""
Pub n°1 — vidéo verticale 1080×1920, 30 i/s, ~26 s, sans musique (le son se
choisit sur TikTok / Reels au moment de publier).

  0.0– 3.0  « I'll start tomorrow. »
  3.0– 6.0  You've said it … 260 times.
  6.0– 9.5  1,584 hours you'll never get back.
  9.5–11.5  Not this time.  (+ logo)
 11.5–15.5  Today — « Vethos plans your day. »
 15.5–19.0  My time — « Around your work, sleep and life. »
 19.0–22.5  Les apps s'éteignent — « When it's time, it blocks the rest. »
 22.5–26.0  Logo · Vethos: Plan & Focus · On the App Store

Usage : python render.py   →  vethos-pub-01.mp4 (+ apercus/*.png)
"""
import math
import os
import subprocess

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, '..', '..'))
MOBILE = os.path.join(RACINE, 'mobile')
CAPTURES = os.path.join(MOBILE, 'store', 'captures', 'originaux')
POLICES = os.path.join(MOBILE, 'node_modules', '@expo-google-fonts')

W, H, FPS = 1080, 1920, 30
DUREE = 26.0
BLANC = (242, 242, 242)
GRIS = (150, 150, 150)
ORANGE = (236, 128, 72)


def police(nom: str, taille: int) -> ImageFont.FreeTypeFont:
    chemins = {
        'semi': ('geist', '600SemiBold', 'Geist_600SemiBold.ttf'),
        'moyen': ('geist', '500Medium', 'Geist_500Medium.ttf'),
        'normal': ('geist', '400Regular', 'Geist_400Regular.ttf'),
        'mono': ('geist-mono', '400Regular', 'GeistMono_400Regular.ttf'),
        'mono-semi': ('geist-mono', '600SemiBold', 'GeistMono_600SemiBold.ttf'),
    }
    d, s, f = chemins[nom]
    return ImageFont.truetype(os.path.join(POLICES, d, s, f), taille)


# ─── Courbes ──────────────────────────────────────────────────────────────
def borne(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def sortie(x):  # ease-out cubique
    x = borne(x)
    return 1 - (1 - x) ** 3


def douce(x):  # ease-in-out
    x = borne(x)
    return x * x * (3 - 2 * x)


def entre(t, debut, duree):
    return borne((t - debut) / duree)


# ─── Fonds ────────────────────────────────────────────────────────────────
def lueur(couleur, cy=0.42, rayon=0.62):
    """Une lueur radiale chaude sur du noir, comme l'onboarding."""
    petit = Image.new('RGB', (108, 192))
    px = petit.load()
    for y in range(192):
        for x in range(108):
            dx = (x / 108 - 0.5) * 1.0
            dy = (y / 192 - cy) * 1.78
            d = math.sqrt(dx * dx + dy * dy) / rayon
            k = max(0.0, 1 - d) ** 1.8
            px[x, y] = tuple(int(c * k) for c in couleur)
    return petit.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30))


FOND_CHAUD = lueur((150, 70, 32))
FOND_FROID = lueur((52, 58, 92), cy=0.38, rayon=0.7)
NOIR = Image.new('RGB', (W, H), (0, 0, 0))


# ─── Texte ────────────────────────────────────────────────────────────────
def texte(img, mots, y, taille, poids='semi', opacite=1.0, decale=0, interligne=1.12, espacement=0):
    """`mots` : liste de lignes, chaque ligne = liste de (texte, couleur). Centré."""
    if opacite <= 0:
        return
    f = police(poids, taille)
    calque = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    hauteur = int(taille * interligne)
    for i, ligne in enumerate(mots):
        largeur = sum(d.textlength(m, font=f) for m, _ in ligne) + espacement * (len(ligne) - 1)
        x = (W - largeur) / 2
        for m, c in ligne:
            d.text((x, y + i * hauteur + decale), m, font=f, fill=c + (int(255 * opacite),))
            x += d.textlength(m, font=f) + espacement
    img.alpha_composite(calque)


def apparait(t, debut, duree=0.45, distance=36):
    k = sortie(entre(t, debut, duree))
    return k, int((1 - k) * distance)


# ─── Téléphone ────────────────────────────────────────────────────────────
def telephone(chemin, largeur=760):
    cap = Image.open(chemin).convert('RGB')
    h = int(cap.height * largeur / cap.width)
    cap = cap.resize((largeur, h), Image.LANCZOS)
    r = 92
    masque = Image.new('L', (largeur, h), 0)
    ImageDraw.Draw(masque).rounded_rectangle((0, 0, largeur - 1, h - 1), r, fill=255)
    bord = 16
    tel = Image.new('RGBA', (largeur + 2 * bord, h + 2 * bord), (0, 0, 0, 0))
    ImageDraw.Draw(tel).rounded_rectangle((0, 0, tel.width - 1, tel.height - 1), r + bord, fill=(28, 28, 30, 255), outline=(70, 70, 74, 255), width=3)
    tel.paste(cap, (bord, bord), masque)
    ombre = Image.new('RGBA', (tel.width + 160, tel.height + 160), (0, 0, 0, 0))
    ImageDraw.Draw(ombre).rounded_rectangle((80, 100, 80 + tel.width, 100 + tel.height), r + bord, fill=(0, 0, 0, 200))
    ombre = ombre.filter(ImageFilter.GaussianBlur(40))
    ombre.alpha_composite(tel, (80, 80))
    return ombre


TODAY = telephone(os.path.join(CAPTURES, 'IMG_5201.PNG'))
SEMAINE = telephone(os.path.join(CAPTURES, 'IMG_5203.PNG'))
LOGO = Image.open(os.path.join(MOBILE, 'assets', 'vethos-logo-argent.png')).convert('RGBA')


def poser(img, objet, cx, y, opacite=1.0, echelle=1.0):
    if opacite <= 0:
        return
    o = objet
    if echelle != 1.0:
        o = o.resize((int(o.width * echelle), int(o.height * echelle)), Image.LANCZOS)
    if opacite < 1:
        a = o.getchannel('A').point(lambda v: int(v * opacite))
        o = o.copy()
        o.putalpha(a)
    img.alpha_composite(o, (int(cx - o.width / 2), int(y)))


def logo(img, cx, cy, taille, opacite=1.0, halo=0.0):
    if halo > 0:
        h = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(h).ellipse((cx - taille, cy - taille, cx + taille, cy + taille), fill=(236, 128, 72, int(90 * halo)))
        img.alpha_composite(h.filter(ImageFilter.GaussianBlur(70)))
    l = LOGO.resize((taille, int(LOGO.height * taille / LOGO.width)), Image.LANCZOS)
    poser(img, l, cx, cy - l.height / 2, opacite)


# ─── Les apps qui s'éteignent ─────────────────────────────────────────────
TEINTES = [(232, 76, 96), (90, 120, 240), (170, 90, 230), (240, 150, 60), (60, 160, 235), (225, 70, 160), (250, 200, 70), (120, 110, 255), (235, 95, 70)]


def apps(img, t, debut):
    taille, ecart = 190, 52
    x0 = (W - (3 * taille + 2 * ecart)) / 2
    y0 = 760
    calque = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)
    for i in range(9):
        r, c = divmod(i, 3)
        k_in, dec = apparait(t, debut + 0.05 * i, 0.4, 40)
        eteinte = douce(entre(t, debut + 1.1 + 0.07 * i, 0.5))
        coul = TEINTES[i]
        gris = 44
        col = tuple(int(v * (1 - eteinte) + gris * eteinte) for v in coul)
        x = x0 + c * (taille + ecart)
        y = y0 + r * (taille + ecart) + dec
        d.rounded_rectangle((x, y, x + taille, y + taille), 46, fill=col + (int(255 * k_in),))
        # Un cadenas discret sur chaque app éteinte.
        if eteinte > 0.05:
            a = int(255 * eteinte * k_in)
            cx, cy = x + taille / 2, y + taille / 2 + 10
            d.rounded_rectangle((cx - 30, cy - 12, cx + 30, cy + 34), 9, fill=(150, 150, 154, a))
            d.arc((cx - 21, cy - 46, cx + 21, cy - 2), 180, 360, fill=(150, 150, 154, a), width=9)
    img.alpha_composite(calque)


# ─── Une image ────────────────────────────────────────────────────────────
def image(t: float) -> Image.Image:
    # Le fond : chaud pour la douleur, froid et calme pour la solution.
    if t < 11.5:
        k = 0.55 + 0.45 * douce(entre(t, 0, 2.5))
        fond = Image.blend(NOIR, FOND_CHAUD, k)
    elif t < 22.5:
        fond = Image.blend(FOND_CHAUD, FOND_FROID, douce(entre(t, 11.5, 1.0)))
    else:
        fond = Image.blend(FOND_FROID, FOND_CHAUD, douce(entre(t, 22.5, 1.2)))
    img = fond.convert('RGBA')

    # 1. « I'll start tomorrow. »
    if t < 3.2:
        sortie_k = 1 - douce(entre(t, 2.75, 0.4))
        k1, d1 = apparait(t, 0.25)
        k2, d2 = apparait(t, 0.85)
        texte(img, [[('“I’ll start', BLANC)]], 760, 112, opacite=k1 * sortie_k, decale=d1)
        texte(img, [[('tomorrow.”', ORANGE)]], 890, 112, opacite=k2 * sortie_k, decale=d2)

    # 2. You've said it … 260 times.
    if 3.0 <= t < 6.2:
        sortie_k = 1 - douce(entre(t, 5.75, 0.4))
        k, d = apparait(t, 3.0)
        n = int(1 + 259 * sortie(entre(t, 3.3, 1.9)))
        texte(img, [[('You’ve said it', GRIS)]], 640, 64, poids='moyen', opacite=k * sortie_k, decale=d)
        texte(img, [[(str(n), BLANC)]], 760, 300, poids='mono-semi', opacite=k * sortie_k, decale=d)
        k3, d3 = apparait(t, 4.6)
        texte(img, [[('times.', BLANC)]], 1110, 76, opacite=k3 * sortie_k, decale=d3)

    # 3. 1,584 hours you'll never get back.
    if 6.0 <= t < 9.7:
        sortie_k = 1 - douce(entre(t, 9.25, 0.4))
        k, d = apparait(t, 6.0)
        n = int(1584 * sortie(entre(t, 6.2, 2.0)))
        texte(img, [[(f'{n:,}', BLANC)]], 680, 250, poids='semi', opacite=k * sortie_k, decale=d)
        k2, d2 = apparait(t, 7.4)
        texte(img, [[('hours you’ll', BLANC)], [('never get back.', BLANC)]], 980, 84, opacite=k2 * sortie_k, decale=d2)

    # 4. Not this time.
    if 9.5 <= t < 11.7:
        sortie_k = 1 - douce(entre(t, 11.25, 0.4))
        k, d = apparait(t, 9.55, 0.35, 24)
        texte(img, [[('Not this time.', BLANC)]], 1120, 104, opacite=k * sortie_k, decale=d)
        kl = sortie(entre(t, 9.75, 0.6))
        logo(img, W / 2, 820, int(300 + 30 * kl), opacite=kl * sortie_k, halo=kl * sortie_k)

    # 5. Today — Vethos plans your day.
    if 11.5 <= t < 15.7:
        k, d = apparait(t, 11.6)
        sortie_k = 1 - douce(entre(t, 15.3, 0.4))
        texte(img, [[('Vethos plans your day.', BLANC)]], 250, 70, opacite=k * sortie_k, decale=d)
        monte = sortie(entre(t, 11.7, 0.8))
        y = 420 + (1 - monte) * 700 - 40 * douce(entre(t, 12.5, 3.0))
        poser(img, TODAY, W / 2, y, opacite=monte * sortie_k)

    # 6. My time — Around your work, sleep and life.
    if 15.5 <= t < 19.2:
        k, d = apparait(t, 15.6)
        sortie_k = 1 - douce(entre(t, 18.8, 0.4))
        texte(img, [[('Around your work,', BLANC)], [('sleep and life.', BLANC)]], 210, 70, opacite=k * sortie_k, decale=d)
        glisse = sortie(entre(t, 15.55, 0.7))
        x = W / 2 + (1 - glisse) * 900
        poser(img, SEMAINE, x, 460 - 40 * douce(entre(t, 16.0, 3.0)), opacite=sortie_k)

    # 7. When it's time, it blocks the rest.
    if 19.0 <= t < 22.7:
        sortie_k = 1 - douce(entre(t, 22.3, 0.4))
        k, d = apparait(t, 19.05)
        texte(img, [[('When it’s time,', BLANC)]], 400, 76, opacite=k * sortie_k, decale=d)
        k2, d2 = apparait(t, 20.1)
        texte(img, [[('it blocks the rest.', ORANGE)]], 500, 76, opacite=k2 * sortie_k, decale=d2)
        if sortie_k < 1:
            calque = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            apps(calque, t, 19.1)
            a = calque.getchannel('A').point(lambda v: int(v * sortie_k))
            calque.putalpha(a)
            img.alpha_composite(calque)
        else:
            apps(img, t, 19.1)

    # 8. Logo · Vethos: Plan & Focus · On the App Store
    if t >= 22.5:
        kl = sortie(entre(t, 22.6, 0.7))
        logo(img, W / 2, 760, int(330 + 20 * kl), opacite=kl, halo=kl)
        k, d = apparait(t, 23.2)
        texte(img, [[('Vethos', BLANC)]], 1010, 104, opacite=k, decale=d)
        k2, d2 = apparait(t, 23.5)
        texte(img, [[('Plan & Focus', GRIS)]], 1135, 56, poids='moyen', opacite=k2, decale=d2)
        k3, d3 = apparait(t, 24.1)
        if k3 > 0:
            # La pastille « On the App Store » (texte seul : le badge officiel d'Apple viendra avec la sortie).
            cal = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            dd = ImageDraw.Draw(cal)
            f = police('semi', 46)
            msg = 'On the App Store'
            lw = dd.textlength(msg, font=f)
            x0, y0 = (W - lw) / 2 - 56, 1300 + d3
            dd.rounded_rectangle((x0, y0, x0 + lw + 112, y0 + 108), 54, fill=(242, 242, 242, int(255 * k3)))
            dd.text((x0 + 56, y0 + 26), msg, font=f, fill=(0, 0, 0, int(255 * k3)))
            img.alpha_composite(cal)

    return img.convert('RGB')


def main():
    sortie_mp4 = os.path.join(ICI, 'vethos-pub-01.mp4')
    apercus = os.path.join(ICI, 'apercus')
    os.makedirs(apercus, exist_ok=True)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    p = subprocess.Popen(
        [ff, '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', sortie_mp4],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    n = int(DUREE * FPS)
    moments = {int(s * FPS) for s in (1.6, 4.9, 8.4, 10.6, 13.5, 17.2, 21.3, 25.0)}
    for i in range(n):
        im = image(i / FPS)
        p.stdin.write(im.tobytes())
        if i in moments:
            im.resize((360, 640)).save(os.path.join(apercus, f'{i // FPS:02d}s.png'))
    p.stdin.close()
    p.wait()
    print(sortie_mp4, os.path.getsize(sortie_mp4) // 1024, 'KB')


if __name__ == '__main__':
    main()
