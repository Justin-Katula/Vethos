"""
Montage de la pub n°2 : les vrais plans de l'app (plans/<nom>/00000.jpg …,
tournés par tournage.py), posés dans un iPhone sur la lueur du soir, une phrase
au-dessus, des fondus entre les plans, puis la carte de fin.

Usage : python montage.py  →  vethos-pub-02.mp4 (+ apercus/)
"""
import glob
import math
import os
import subprocess

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.abspath(os.path.join(ICI, '..', '..', 'mobile'))
POLICES = os.path.join(MOBILE, 'node_modules', '@expo-google-fonts')
W, H, FPS = 1080, 1920, 30
BLANC = (242, 242, 242)
GRIS = (160, 160, 160)

# (plan, première image, dernière image, phrase au-dessus du téléphone)
SEQUENCE = [
    ('demain', 12, 132, 'Be honest.'),
    ('calendrier', 14, 150, 'Every dot is a lost evening.'),
    ('heures', 18, 108, 'It adds up.'),
    ('vethos', 30, 104, 'Vethos gives them back.'),
    ('vethos', 130, 172, ''),
    ('formes', 28, 178, 'Tell it what matters.'),
    ('blocage2', 0, 105, 'It locks what pulls you away.'),
    ('place', 28, 208, 'It plans your week.'),
]
FONDU = 8  # images
FIN = 3.4  # secondes de carte de fin

TEL_L = 700  # largeur de l'écran dans le téléphone
TEL_Y = 262


def police(nom, taille):
    d, s, f = {
        'semi': ('geist', '600SemiBold', 'Geist_600SemiBold.ttf'),
        'moyen': ('geist', '500Medium', 'Geist_500Medium.ttf'),
    }[nom]
    return ImageFont.truetype(os.path.join(POLICES, d, s, f), taille)


def borne(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def sortie(x):
    x = borne(x)
    return 1 - (1 - x) ** 3


def douce(x):
    x = borne(x)
    return x * x * (3 - 2 * x)


def lueur(couleur, cy=0.42, rayon=0.62):
    petit = Image.new('RGB', (108, 192))
    px = petit.load()
    for y in range(192):
        for x in range(108):
            dx = (x / 108 - 0.5)
            dy = (y / 192 - cy) * 1.78
            k = max(0.0, 1 - math.sqrt(dx * dx + dy * dy) / rayon) ** 1.8
            px[x, y] = tuple(int(c * k) for c in couleur)
    return petit.resize((W, H), Image.BICUBIC).filter(ImageFilter.GaussianBlur(30))


FOND = lueur((150, 70, 32), cy=0.30, rayon=0.75)

# Le cadre du téléphone, calculé une fois.
ECRAN_H = int(2532 * TEL_L / 1170)
RAYON = 96
BORD = 16
MASQUE = Image.new('L', (TEL_L, ECRAN_H), 0)
ImageDraw.Draw(MASQUE).rounded_rectangle((0, 0, TEL_L - 1, ECRAN_H - 1), RAYON, fill=255)
CADRE = Image.new('RGBA', (TEL_L + 2 * BORD + 160, ECRAN_H + 2 * BORD + 160), (0, 0, 0, 0))
ImageDraw.Draw(CADRE).rounded_rectangle((80, 100, 80 + TEL_L + 2 * BORD, 100 + ECRAN_H + 2 * BORD), RAYON + BORD, fill=(0, 0, 0, 210))
CADRE = CADRE.filter(ImageFilter.GaussianBlur(42))
ImageDraw.Draw(CADRE).rounded_rectangle((80, 80, 80 + TEL_L + 2 * BORD, 80 + ECRAN_H + 2 * BORD), RAYON + BORD, fill=(24, 24, 26, 255), outline=(78, 78, 82, 255), width=3)


def telephone(ecran: Image.Image, echelle=1.0) -> Image.Image:
    t = CADRE.copy()
    e = ecran.resize((TEL_L, ECRAN_H), Image.LANCZOS)
    t.paste(e, (80 + BORD, 80 + BORD), MASQUE)
    if echelle != 1.0:
        t = t.resize((int(t.width * echelle), int(t.height * echelle)), Image.LANCZOS)
    return t


def phrase(img, texte, opacite, decale=0, taille=62, y=118):
    if opacite <= 0 or not texte:
        return
    f = police('semi', taille)
    cal = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(cal)
    # Retour à la ligne si la phrase dépasse la largeur utile.
    mots, lignes, cur = texte.split(), [], ''
    for m in mots:
        essai = (cur + ' ' + m).strip()
        if d.textlength(essai, font=f) > W - 140 and cur:
            lignes.append(cur)
            cur = m
        else:
            cur = essai
    lignes.append(cur)
    y0 = y - (len(lignes) - 1) * taille * 0.56
    for i, l in enumerate(lignes):
        lw = d.textlength(l, font=f)
        d.text(((W - lw) / 2, y0 + i * taille * 1.12 + decale), l, font=f, fill=BLANC + (int(255 * opacite),))
    img.alpha_composite(cal)


LOGO = Image.open(os.path.join(MOBILE, 'assets', 'vethos-logo-argent.png')).convert('RGBA')


def carte_fin(t):
    img = FOND.convert('RGBA')
    k = sortie(t / 0.7)
    halo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(halo).ellipse((W / 2 - 330, 760 - 330, W / 2 + 330, 760 + 330), fill=(236, 128, 72, int(90 * k)))
    img.alpha_composite(halo.filter(ImageFilter.GaussianBlur(70)))
    taille = int(330 + 20 * k)
    l = LOGO.resize((taille, int(LOGO.height * taille / LOGO.width)), Image.LANCZOS)
    a = l.getchannel('A').point(lambda v: int(v * k))
    l.putalpha(a)
    img.alpha_composite(l, (int(W / 2 - l.width / 2), int(760 - l.height / 2)))
    for txt, y, tl, poids, c, debut in (('Vethos', 1010, 104, 'semi', BLANC, 0.5), ('Plan & Focus', 1135, 56, 'moyen', GRIS, 0.8)):
        kk = sortie((t - debut) / 0.45)
        if kk > 0:
            f = police(poids, tl)
            cal = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(cal)
            lw = d.textlength(txt, font=f)
            d.text(((W - lw) / 2, y + (1 - kk) * 30), txt, font=f, fill=c + (int(255 * kk),))
            img.alpha_composite(cal)
    k3 = sortie((t - 1.3) / 0.45)
    if k3 > 0:
        cal = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(cal)
        f = police('semi', 46)
        msg = 'On the App Store'
        lw = d.textlength(msg, font=f)
        x0, y0 = (W - lw) / 2 - 56, 1300 + (1 - k3) * 30
        d.rounded_rectangle((x0, y0, x0 + lw + 112, y0 + 108), 54, fill=(242, 242, 242, int(255 * k3)))
        d.text((x0 + 56, y0 + 26), msg, font=f, fill=(0, 0, 0, int(255 * k3)))
        img.alpha_composite(cal)
    return img.convert('RGB')


def images_du_plan(nom, a, b):
    fs = sorted(glob.glob(os.path.join(ICI, 'plans', nom, '*.jpg')))
    return fs[a:b]


def main():
    plans = [(images_du_plan(n, a, b), txt) for n, a, b, txt in SEQUENCE]
    sortie_mp4 = os.path.join(ICI, 'vethos-pub-02.mp4')
    apercus = os.path.join(ICI, 'apercus')
    os.makedirs(apercus, exist_ok=True)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    p = subprocess.Popen(
        [ff, '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', sortie_mp4],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    n_total = 0

    def ecrire(im):
        nonlocal n_total
        p.stdin.write(im.tobytes())
        if n_total % 45 == 0:
            im.resize((270, 480)).save(os.path.join(apercus, f'{n_total:04d}.png'))
        n_total += 1

    precedent = None  # la dernière image du plan précédent, pour le fondu
    for i, (fichiers, txt) in enumerate(plans):
        n = len(fichiers)
        for j, f in enumerate(fichiers):
            img = FOND.convert('RGBA')
            # Le téléphone respire à peine : un très léger zoom sur la durée du plan.
            echelle = 1.0 + 0.025 * douce(j / max(1, n - 1))
            tel = telephone(Image.open(f).convert('RGB'), echelle)
            img.alpha_composite(tel, (int(W / 2 - tel.width / 2), int(TEL_Y - 80 * echelle)))
            k = sortie(j / 12)
            ks = 1 - douce((j - (n - 10)) / 10) if j > n - 10 else 1
            phrase(img, txt, k * ks, int((1 - k) * 24))
            im = img.convert('RGB')
            if precedent is not None and j < FONDU:
                im = Image.blend(precedent, im, douce((j + 1) / FONDU))
            ecrire(im)
            derniere = im
        precedent = derniere
    # La carte de fin, en fondu depuis le dernier plan.
    for j in range(int(FIN * FPS)):
        im = carte_fin(j / FPS)
        if j < FONDU * 2:
            im = Image.blend(precedent, im, douce((j + 1) / (FONDU * 2)))
        ecrire(im)
    p.stdin.close()
    p.wait()
    print(sortie_mp4, os.path.getsize(sortie_mp4) // 1024, 'KB', f'{n_total / FPS:.1f} s')


if __name__ == '__main__':
    main()
