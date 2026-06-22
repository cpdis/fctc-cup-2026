#!/usr/bin/env python3
"""Download terrain tiles around the lake, build a soft hillshade, and cache it
as relief.npz (hillshade array + lon/lat bounds). Run once; render reads it."""
import urllib.request, math, io, json
import numpy as np
from PIL import Image

Z = 15  # higher zoom -> finer relief
LAT0, LAT1 = -31.9320, -31.9070
LON0, LON1 = 115.7930, 115.8180


def deg2tile(lat, lon, z):
    n = 2**z
    x = (lon+180)/360*n
    y = (1-math.log(math.tan(math.radians(lat))+1/math.cos(math.radians(lat)))/math.pi)/2*n
    return x, y


def tile2lon(x, z): return x/2**z*360-180
def tile2lat(y, z): return math.degrees(math.atan(math.sinh(math.pi*(1-2*y/2**z))))


x0, y1 = deg2tile(LAT0, LON0, Z)
x1, y0 = deg2tile(LAT1, LON1, Z)
txs = range(int(x0), int(x1)+1)
tys = range(int(y0), int(y1)+1)

cols = []
for ty in tys:
    row = []
    for tx in txs:
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{tx}/{ty}.png"
        data = urllib.request.urlopen(url, timeout=15).read()
        im = np.asarray(Image.open(io.BytesIO(data)).convert("RGB")).astype(float)
        row.append(im[:, :, 0]*256+im[:, :, 1]+im[:, :, 2]/256-32768)
    cols.append(np.hstack(row))
elev = np.vstack(cols)
# clean nodata spikes (coastal tiles carry sentinel lows)
med = np.median(elev[(elev > -10) & (elev < 200)])
elev[(elev < -10) | (elev > 200)] = med

# bounds of the assembled mosaic
west = tile2lon(min(txs), Z); east = tile2lon(max(txs)+1, Z)
north = tile2lat(min(tys), Z); south = tile2lat(max(tys)+1, Z)

# hillshade (light from NW)
az, alt = math.radians(315), math.radians(45)
px = (east-west)*111320*math.cos(math.radians((north+south)/2))/elev.shape[1]
py = (north-south)*110540/elev.shape[0]
dy, dx = np.gradient(elev, py, px)
slope = np.pi/2 - np.arctan(np.hypot(dx, dy))
aspect = np.arctan2(-dx, dy)
hs = (np.sin(alt)*np.sin(slope) + np.cos(alt)*np.cos(slope)*np.cos(az-aspect))
hs = np.clip(hs, 0, 1)

np.savez("relief.npz", hillshade=hs.astype(np.float32),
         bounds=np.array([west, east, south, north]))
print(f"relief.npz saved  shape={hs.shape}  bounds W{west:.4f} E{east:.4f} S{south:.4f} N{north:.4f}")
print(f"elev min={elev.min():.1f} max={elev.max():.1f} std={elev.std():.1f}")
