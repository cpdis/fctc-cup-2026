#!/usr/bin/env python3
"""
Herdsman route hazard graphic.

Reads GPS from every JPEG in PHOTO_DIR, snaps each to the FCTC GPX loop, and
lays the photos around a clean light-mode map of the route with leader lines to
the exact spot each was taken. Tufte-minded: one route line, no chartjunk, the
photos *are* the data; labels carry the note + distance-along-route. Text-only
markers (NOTES) flag spots to verify that have no photo.

Output: route-hazards.pdf (vector) + route-hazards.jpg (preview).
"""
import os, math, glob, textwrap, datetime
import xml.etree.ElementTree as ET
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm


def setup_font():
    """Use Berkeley Mono if the licensed font is dropped in fonts/, else a
    bundled monospace fallback. Register every ttf/otf found, then pick."""
    dirs = ["fonts", "/mnt/skills/examples/canvas-design/canvas-fonts"]
    for d in dirs:
        if os.path.isdir(d):
            for f in glob.glob(os.path.join(d, "*.tt[fc]")) + glob.glob(os.path.join(d, "*.otf")):
                try: fm.fontManager.addfont(f)
                except Exception: pass
    names = {f.name for f in fm.fontManager.ttflist}
    for pref in ("Berkeley Mono", "TX-02", "JetBrains Mono", "IBM Plex Mono",
                 "Geist Mono", "DejaVu Sans Mono"):
        if pref in names:
            matplotlib.rcParams["font.family"] = pref
            print(f"  font: {pref}")
            return pref
    return None
from matplotlib.offsetbox import OffsetImage, AnnotationBbox, TextArea, VPacker
from matplotlib.patches import FancyArrowPatch, PathPatch
from matplotlib.path import Path as MplPath
from matplotlib.lines import Line2D
import json as _json
from PIL import Image, ImageOps, ExifTags

GPX = "../Inaugural_FCTC_.gpx"
PHOTO_DIR = "photos"
OUT = "route-hazards"

# token -> (caption, kind)   kind in {"clear","hazard"}
CAPTIONS = {
    "0195": ("Footbridge over the channel — clear crossing", "clear"),
    "0196": ("Bench junction — muddy puddle at the fork", "hazard"),
    "1860": ("Flooded paperbark section — logs across the water", "hazard"),
    "0193": ("Flooded paperbark section — logs across the water", "hazard"),
    "0194": ("Wide puddle on a churned track", "hazard"),
    "1861": ("Path flooded under the paperbarks", "hazard"),
}

# text-only markers (no photo): lat, lon, title, body
NOTES = [
    dict(lat=-31.9149307, lon=115.8117892, title="NE footbridge",
         body="Bridge is currently there — but check Wednesday "
              "morning during the prerun."),
]

# named track sections (placed along the route at a distance, label sits inward)
SEGMENTS = [
    dict(along=5285, name="First Iynyrd Skynyrd", rot=-8, dist=0.13),   # at IMG_1860
    dict(along=6229, name="Second Iynyrd Skynyrd", rot=10, dist=0.13),  # at NE footbridge
]

BG     = "#faf8f3"   # warm paper
INK    = "#2b2b2b"
ROUTE  = "#3a6ea5"   # calm blue route line
HAZARD = "#b5341f"   # rust red — water hazard
OK     = "#2e7d32"   # green — clear crossing
VERIFY = "#c8851a"   # amber — verify before race
COLOR  = {"clear": OK, "hazard": HAZARD, "verify": VERIFY}


def load_route():
    pts = []
    for t in ET.parse(GPX).iter("{http://www.topografix.com/GPX/1/1}trkpt"):
        pts.append((float(t.get("lat")), float(t.get("lon"))))
    return np.array([p[0] for p in pts]), np.array([p[1] for p in pts])


def hav(a, b):
    R = 6371000.0
    dlat = math.radians(b[0]-a[0]); dlon = math.radians(b[1]-a[1])
    x = math.sin(dlat/2)**2 + math.cos(math.radians(a[0]))*math.cos(math.radians(b[0]))*math.sin(dlon/2)**2
    return 2*R*math.asin(math.sqrt(x))


def gps_of(path):
    exif = Image.open(path).getexif()
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    if not gps or ExifTags.GPS.GPSLatitude not in gps:
        return None
    g = {ExifTags.GPSTAGS.get(k, k): v for k, v in gps.items()}
    def dms(v): return float(v[0])+float(v[1])/60+float(v[2])/3600
    lat = dms(g["GPSLatitude"]); lon = dms(g["GPSLongitude"])
    if g.get("GPSLatitudeRef") == "S": lat = -lat
    if g.get("GPSLongitudeRef") == "W": lon = -lon
    return lat, lon


def main():
    setup_font()
    lat, lon = load_route()
    m_per_lon = math.cos(math.radians(lat.mean()))*111320
    X = (lon-lon.mean())*m_per_lon
    Y = (lat-lat.mean())*110540
    cum = np.concatenate([[0], np.cumsum([hav((lat[i],lon[i]),(lat[i+1],lon[i+1]))
                                          for i in range(len(lat)-1)])])
    L = cum[-1]

    def project(la, lo):
        return (lo-lon.mean())*m_per_lon, (la-lat.mean())*110540

    def snap(la, lo):
        i = int(np.argmin([hav((la, lo), (lat[j], lon[j])) for j in range(len(lat))]))
        return i, cum[i]

    # ---- collect geotagged photos ----
    photos = []
    for p in sorted(glob.glob(os.path.join(PHOTO_DIR, "*.jp*g"))):
        token = next((t for t in os.path.basename(p).replace(".", "_").split("_")
                      if t.isdigit() and len(t) == 4), os.path.basename(p))
        g = gps_of(p)
        if not g:
            print(f"  SKIP (no GPS): {os.path.basename(p)}"); continue
        i, along = snap(*g)
        cap, kind = CAPTIONS.get(token, ("", "hazard"))
        x, y = project(*g)
        photos.append(dict(path=p, token=token, kind=kind, cap=cap,
                           x=x, y=y, along=along))
        print(f"  {token}: {along:.0f} m ({100*along/L:.0f}%)  snap {hav(g,(lat[i],lon[i])):.1f} m  [{kind}]")
    photos.sort(key=lambda d: d["along"])

    # ---- figure ----
    fig, ax = plt.subplots(figsize=(13, 12.5), dpi=200)
    fig.patch.set_facecolor(BG); ax.set_facecolor(BG)

    loop = MplPath(np.column_stack([X, Y]))

    # ---- basemap raster, feathered out with distance from the track ----
    # Full opacity inside the loop and right at the track; fades to paper as you
    # move away on the outside. Paper (axes facecolor) shows through the fade.
    if os.path.exists("basemap.png"):
        from scipy.spatial import cKDTree
        b = _json.load(open("basemap_bounds.json"))
        base = np.asarray(Image.open("basemap.png").convert("RGB"))
        H, W = base.shape[:2]
        ext = [project(lat.mean(), b["west"])[0], project(lat.mean(), b["east"])[0],
               project(b["south"], lon.mean())[1], project(b["north"], lon.mean())[1]]

        # distance + inside test on a coarse grid, then upsample the alpha
        gw, gh = 360, int(360*H/W)
        gx = np.linspace(ext[0], ext[1], gw)
        gy = np.linspace(ext[3], ext[2], gh)           # top->bottom (row0 = north)
        GX, GY = np.meshgrid(gx, gy)
        pts = np.column_stack([GX.ravel(), GY.ravel()])
        dist = cKDTree(np.column_stack([X, Y])).query(pts)[0].reshape(gh, gw)
        inside = loop.contains_points(pts).reshape(gh, gw)

        NEAR, FAR = 20.0, 430.0                          # metres
        t = np.clip((dist-NEAR)/(FAR-NEAR), 0, 1)
        alpha = 1 - (t*t*(3-2*t))                        # smoothstep falloff
        alpha[inside] = 1.0
        alpha_full = np.asarray(Image.fromarray((alpha*255).astype(np.uint8))
                                .resize((W, H), Image.BILINEAR))
        rgba = np.dstack([base, alpha_full]).astype(np.uint8)
        ax.imshow(rgba, extent=ext, origin="upper", zorder=0, interpolation="bilinear")

    ax.plot(X, Y, "-", color=ROUTE, lw=2.6, solid_capstyle="round", zorder=2)

    for km in range(0, int(L//1000)+1):
        i = int(np.argmin(np.abs(cum-km*1000)))
        ax.plot(X[i], Y[i], "o", color=INK, ms=3, zorder=3)
        ax.annotate(f"{km}", (X[i], Y[i]), textcoords="offset points",
                    xytext=(4, 4), fontsize=7, color="#8a8580", zorder=3)

    # direction of travel
    i2 = int(np.argmin(np.abs(cum-120)))
    ax.annotate("", xy=(X[i2], Y[i2]), xytext=(X[0], Y[0]),
                arrowprops=dict(arrowstyle="-|>", color=OK, lw=2), zorder=4)
    ax.plot(X[0], Y[0], "s", color=OK, ms=11, zorder=4)
    ax.annotate("START / FINISH", (X[0], Y[0]), textcoords="offset points",
                xytext=(12, -2), fontsize=9.5, weight="bold", color=OK, zorder=4)

    xr = X.max()-X.min(); yr = Y.max()-Y.min()
    cx = (X.max()+X.min())/2; cy = (Y.max()+Y.min())/2
    ax.set_aspect("equal"); ax.axis("off")
    CARD_W, CARD_H = 360, 270

    def rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

    def card(path, col):
        im = ImageOps.exif_transpose(Image.open(path))
        w, h = im.size; tgt = CARD_W/CARD_H
        if w/h > tgt:
            nw = int(h*tgt); im = im.crop(((w-nw)//2, 0, (w+nw)//2, h))
        else:
            nh = int(w/tgt); im = im.crop((0, (h-nh)//2, w, (h+nh)//2))
        return ImageOps.expand(im.resize((CARD_W, CARD_H)), border=7, fill=rgb(col))

    oxs, oys = [], []

    # ---- photo cards ----
    for d in photos:
        col = COLOR[d["kind"]]
        ax.plot(d["x"], d["y"], "o", color=col, ms=10, mec="white", mew=1.6, zorder=6)
        ang = math.atan2(d["y"]-cy, d["x"]-cx)
        ox = cx + math.cos(ang)*xr*1.10; oy = cy + math.sin(ang)*yr*1.10
        oxs.append(ox); oys.append(oy)
        img = OffsetImage(np.asarray(card(d["path"], col)), zoom=0.40)
        l1 = TextArea(f"IMG_{d['token']}  ·  {d['along']/1000:.2f} km",
                      textprops=dict(weight="bold", color=col, size=11))
        l2 = TextArea(d["cap"], textprops=dict(color=INK, size=9))
        pack = VPacker(children=[img, l1, l2], align="center", pad=0, sep=5)
        ax.add_artist(AnnotationBbox(pack, (ox, oy), frameon=False, zorder=7, pad=0))
        ax.add_patch(FancyArrowPatch((ox, oy), (d["x"], d["y"]), arrowstyle="-",
                     color=col, lw=1.4, alpha=0.8,
                     connectionstyle="arc3,rad=0.05", zorder=5))

    # ---- text-only verify notes ----
    for n in NOTES:
        col = VERIFY
        x, y = project(n["lat"], n["lon"])
        i, along = snap(n["lat"], n["lon"])
        ax.plot(x, y, "D", color=col, ms=11, mec="white", mew=1.6, zorder=6)
        ang = math.atan2(y-cy, x-cx)
        ox = cx + math.cos(ang)*xr*1.10; oy = cy + math.sin(ang)*yr*1.10
        oxs.append(ox); oys.append(oy)
        title = TextArea(f"{n['title']}  ·  {along/1000:.2f} km",
                         textprops=dict(weight="bold", color=col, size=11))
        body = TextArea("\n".join(textwrap.wrap(n["body"], 30)),
                        textprops=dict(color=INK, size=9))
        pack = VPacker(children=[title, body], align="center", pad=6, sep=4)
        ax.add_artist(AnnotationBbox(pack, (ox, oy), frameon=True, zorder=7, pad=0.4,
                      bboxprops=dict(edgecolor=col, lw=2, facecolor="white")))
        ax.add_patch(FancyArrowPatch((ox, oy), (x, y), arrowstyle="-",
                     color=col, lw=1.4, alpha=0.85,
                     connectionstyle="arc3,rad=0.05", zorder=5))

    # ---- named track sections (label sits outside, line points in to track) ----
    for seg in SEGMENTS:
        i = int(np.argmin(np.abs(cum-seg["along"])))
        sx, sy = X[i], Y[i]
        ang = math.atan2(sy-cy, sx-cx) + math.radians(seg.get("rot", 0))
        d = seg.get("dist", 0.13)
        lx = sx + math.cos(ang)*xr*d            # just outside the loop
        ly = sy + math.sin(ang)*yr*d
        ax.annotate("", xy=(sx, sy), xytext=(lx, ly),
                    arrowprops=dict(arrowstyle="-", color="#8a7f6c", lw=1.0,
                                    alpha=0.85), zorder=5)
        ax.plot(sx, sy, "o", color="#6a5f4c", ms=5, mec="white", mew=1, zorder=6)
        ax.annotate(seg["name"], (lx, ly), fontsize=10, style="italic",
                    weight="bold", color="#5a4f3c", ha="center", va="center",
                    zorder=8, bbox=dict(boxstyle="round,pad=0.3", fc=BG,
                                        ec="#8a7f6c", lw=0.9, alpha=0.95))

    # ---- limits ----
    xs = list(X)+oxs; ys = list(Y)+oys
    mx = (max(xs)-min(xs))*0.12; my = (max(ys)-min(ys))*0.14
    ax.set_xlim(min(xs)-mx, max(xs)+mx)
    ax.set_ylim(min(ys)-my, max(ys)+my)

    # ---- legend ----
    handles = [
        Line2D([0],[0], marker="o", color="none", markerfacecolor=OK, markersize=11, label="Clear crossing"),
        Line2D([0],[0], marker="o", color="none", markerfacecolor=HAZARD, markersize=11, label="Water hazard"),
        Line2D([0],[0], marker="D", color="none", markerfacecolor=VERIFY, markersize=11, label="Verify before race"),
    ]
    leg = ax.legend(handles=handles, loc="upper left", frameon=False,
                    fontsize=10.5, handletextpad=0.4, labelspacing=0.8,
                    bbox_to_anchor=(0.0, 1.0))
    for t in leg.get_texts(): t.set_color(INK)

    n_haz = sum(1 for d in photos if d["kind"] == "hazard")
    fig.suptitle("Herdsman Lake Loop — Water Hazard Reconnaissance",
                 x=0.5, y=0.95, fontsize=18, weight="bold", color=INK)
    ax.set_title(f"FCTC Cup route · {L/1000:.2f} km · {n_haz} water hazards · "
                 f"{len(NOTES)} to verify · recon {datetime.date.today():%-d %b %Y}",
                 fontsize=10.5, color="#6b6660", pad=16)

    ax.annotate("Basemap © OpenStreetMap · CARTO", (0.995, 0.004),
                xycoords="axes fraction", ha="right", va="bottom",
                fontsize=6.5, color="#a39c8f")

    fig.savefig(f"{OUT}.pdf", facecolor=BG, bbox_inches="tight")
    fig.savefig(f"{OUT}.jpg", dpi=150, facecolor=BG, bbox_inches="tight")
    print("wrote", OUT+".pdf /", OUT+".jpg")


if __name__ == "__main__":
    main()
