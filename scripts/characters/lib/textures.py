"""
Préparation des textures Rocketbox (appelé par build-avatars.mjs) :
  textures.py color  <in.tga> <out.jpg> <taille> [qualité]   carte de couleur opaque → JPEG sRGB
  textures.py normal <in.tga> <out.jpg> <taille> [qualité]   carte de normales → JPEG
  textures.py alpha  <in.tga> <out.png> <taille>             cheveux/cils (RGBA) → PNG, couleur dilatée
                                                             sous les zones transparentes (pas de liseré
                                                             sombre au filtrage / mipmaps)
"""
import sys
import numpy as np
from PIL import Image, ImageFilter


def dilate_rgba(im: Image.Image) -> Image.Image:
    a = np.asarray(im, dtype=np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3:4]
    w = (alpha > 0.02).astype(np.float32)
    acc_rgb = rgb * w
    acc_w = w.copy()
    out = rgb.copy()
    # remplissage « push-pull » : flous successifs pondérés par la couverture
    filled = w[..., 0] > 0
    for radius in (2, 4, 8, 16, 32, 64):
        pr = Image.fromarray(np.uint8(np.clip(acc_rgb, 0, 1) * 255))
        pw = Image.fromarray(np.uint8(np.clip(acc_w[..., 0], 0, 1) * 255))
        br = np.asarray(pr.filter(ImageFilter.BoxBlur(radius)), dtype=np.float32) / 255.0
        bw = np.asarray(pw.filter(ImageFilter.BoxBlur(radius)), dtype=np.float32)[..., None] / 255.0
        est = br / np.maximum(bw, 1e-4)
        todo = (~filled) & (bw[..., 0] > 1e-3)
        out[todo] = est[todo]
        filled |= todo
        if filled.all():
            break
    res = np.concatenate([out, alpha], axis=-1)
    return Image.fromarray(np.uint8(np.clip(res, 0, 1) * 255 + 0.5), 'RGBA')


def main():
    mode, src, dst, size = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    quality = int(sys.argv[5]) if len(sys.argv) > 5 else 85
    im = Image.open(src)
    if mode == 'alpha':
        im = im.convert('RGBA')
        # dilatation à pleine résolution puis réduction (le filtrage ne mélange plus le noir)
        im = dilate_rgba(im.resize((size * 2, size * 2), Image.LANCZOS)).resize((size, size), Image.LANCZOS)
        # palette 256 couleurs avec alpha : ~2,5× plus léger, invisible sur des mèches
        im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(dst, optimize=True)
    else:
        im = im.convert('RGB').resize((size, size), Image.LANCZOS)
        im.save(dst, quality=quality, optimize=True, progressive=False, subsampling=0 if mode == 'normal' else 2)


if __name__ == '__main__':
    main()
