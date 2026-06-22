#!/usr/bin/env python3
"""Write GPS EXIF into the photos that lost it, producing geotagged copies."""
import os, piexif
from fractions import Fraction
from PIL import Image

SRC = "/root/.claude/uploads/ce158b9c-09d6-529c-9e8c-fc254eae1aa2"
OUT = "geotagged"
os.makedirs(OUT, exist_ok=True)

# filename -> (lat, lon, source-note)
JOBS = {
    "bad8290b-IMG_0193.jpeg": (-31.922050, 115.813797, "IMG_0193"),   # = IMG_1860 spot
    "f400cd65-IMG_0194.jpeg": (-31.912183, 115.805073, "IMG_0194"),   # horseshoe ~7.25 km
    "11461364-IMG_1861.jpeg": (-31.912183, 115.805073, "IMG_1861"),   # same as 0194
}


def deg_to_dms_rational(dec):
    dec = abs(dec)
    d = int(dec); m = int((dec-d)*60); s = (dec-d-m/60)*3600
    sf = Fraction(s).limit_denominator(10000)
    return [(d, 1), (m, 1), (sf.numerator, sf.denominator)]


def geotag(path, lat, lon, out):
    try:
        exif = piexif.load(path)
    except Exception:
        exif = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    gps = {
        piexif.GPSIFD.GPSVersionID: (2, 3, 0, 0),
        piexif.GPSIFD.GPSLatitudeRef: "S" if lat < 0 else "N",
        piexif.GPSIFD.GPSLatitude: deg_to_dms_rational(lat),
        piexif.GPSIFD.GPSLongitudeRef: "W" if lon < 0 else "E",
        piexif.GPSIFD.GPSLongitude: deg_to_dms_rational(lon),
    }
    exif["GPS"] = gps
    piexif.insert(piexif.dump(exif), path, out)


for fn, (lat, lon, note) in JOBS.items():
    src = os.path.join(SRC, fn)
    out = os.path.join(OUT, note + ".jpeg")
    # piexif.insert needs a jpeg on disk; copy via PIL to normalise then tag
    Image.open(src).save(out, "JPEG", quality=95)
    geotag(out, lat, lon, out)
    # verify
    g = piexif.load(out)["GPS"]
    print(f"{note}: tagged {lat:.6f},{lon:.6f}  -> keys {list(g.keys())[:3]}...")
print("done")
