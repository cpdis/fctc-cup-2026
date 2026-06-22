#!/usr/bin/env python3
"""Download a CARTO Voyager basemap raster around the lake and cache it as
basemap.png (+ basemap_bounds.json with lon/lat extent). Clean light map:
green parks, blue water, streets, labels — like a standard map view."""
import urllib.request, math, io, json, time
from PIL import Image

Z = 16
LAT0, LAT1 = -31.935, -31.904          # south, north
LON0, LON1 = 115.790, 115.821          # west, east
TS = 512                                # @2x tiles
URL = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"


def lon2x(lon, z): return int((lon+180)/360*2**z)
def lat2y(lat, z):
    return int((1-math.log(math.tan(math.radians(lat))+1/math.cos(math.radians(lat)))/math.pi)/2*2**z)
def x2lon(x, z): return x/2**z*360-180
def y2lat(y, z): return math.degrees(math.atan(math.sinh(math.pi*(1-2*y/2**z))))


xmin, xmax = lon2x(LON0, Z), lon2x(LON1, Z)
ymin, ymax = lat2y(LAT1, Z), lat2y(LAT0, Z)
nx, ny = xmax-xmin+1, ymax-ymin+1
mosaic = Image.new("RGB", (nx*TS, ny*TS))
print(f"tiles {nx}x{ny} = {nx*ny}")

for xt in range(xmin, xmax+1):
    for yt in range(ymin, ymax+1):
        url = URL.format(z=Z, x=xt, y=yt)
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "fctc-recon/1.0"})
                im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=20).read())).convert("RGB")
                mosaic.paste(im, ((xt-xmin)*TS, (yt-ymin)*TS))
                break
            except Exception as e:
                if attempt == 3: raise
                time.sleep(2**attempt)

bounds = dict(west=x2lon(xmin, Z), east=x2lon(xmax+1, Z),
              north=y2lat(ymin, Z), south=y2lat(ymax+1, Z))
mosaic.save("basemap.png")
json.dump(bounds, open("basemap_bounds.json", "w"))
print("saved basemap.png", mosaic.size, bounds)
