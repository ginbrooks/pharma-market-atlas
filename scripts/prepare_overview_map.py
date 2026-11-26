"""Build the atlas at continental scales; zoomed views use the original Natural Earth layers.

Install mapshaper 0.6.113 and Pillow, then run this script with --mapshaper PATH.
"""
import argparse
import json
import math
from pathlib import Path
import subprocess
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data" / "basemap"
OUT = ROOT / "frontend" / "src" / "map-overview"


def simplify(source, target, resolution, mapshaper, extra=()):
    subprocess.run([mapshaper, str(source), *extra, "-simplify", "resolution=" + resolution,
                    "keep-shapes", "-o", str(target), "format=geojson", "precision=0.001",
                    "force"], check=True)



def place_labels():
    markers = []
    for feature in json.loads((BASE / "geographic-labels.geojson").read_bytes())["features"]:
        p, geom = feature["properties"], feature["geometry"]
        if geom["type"] == "Point" and p.get("name") and p.get("kind") in ("lake", "sea", "ocean", "port"):
            maximum = p.get("max_zoom", 7)
            if maximum == 7 and p["kind"] != "ocean":
                maximum = 10
            markers.append([p["kind"], p["name"], geom["coordinates"][:2],
                            p.get("rank", 5), p.get("min_zoom", 4), maximum])
    # Label each river halfway along its longest named line, using its source scale.
    rivers = {}
    for feature in json.loads((BASE / "rivers.geojson").read_bytes())["features"]:
        p, geom = feature["properties"], feature["geometry"]
        if not p.get("label") or not p.get("name"):
            continue
        lines = [geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"]
        for line in lines:
            distances = [math.hypot((b[0] - a[0]) * math.cos(math.radians((b[1] + a[1]) / 2)),
                                    b[1] - a[1]) for a, b in zip(line, line[1:])]
            length = sum(distances)
            if length <= rivers.get(p["name"], [0])[0]:
                continue
            left = length / 2
            for a, b, dist in zip(line, line[1:], distances):
                if left <= dist:
                    point = [round(a[i] + (b[i] - a[i]) * left / dist, 6) for i in range(2)]
                    rivers[p["name"]] = (length, ["river", p["name"], point, p.get("rank") or 5,
                                                  p.get("label_zoom") or 4, 10])
                    break
                left -= dist
    return [m for _, m in rivers.values()] + markers


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mapshaper", default="mapshaper")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        simplify(ROOT / "data/world.geojson", temp / "countries.json", "2400x1400", args.mapshaper)
        world = json.loads((temp / "countries.json").read_bytes())
        original = json.loads((ROOT / "data/world.geojson").read_bytes())
        assert len(world["features"]) == len(original["features"])
        for feature, source in zip(world["features"], original["features"]):
            assert feature["properties"]["iso3"] == source["properties"]["iso3"]
            props = feature["properties"]
            if not feature.get("geometry"):
                feature["geometry"] = source["geometry"]
            feature["properties"] = {k: props[k] for k in ("iso3", "label_x", "label_y", "label_rank")}
        assert all(f["geometry"] for f in world["features"])
        (OUT / "countries.geojson").write_text(json.dumps(world, separators=(",", ":")))

        # The initial view spans continents. Regional rivers are enabled from zoom 3.
        hydro = {}
        for name, filters, fields in [
            ("lakes", (), "-"),
            ("rivers", ("-filter", "rank<=3"), "rank"),
        ]:
            simplify(BASE / (name + ".geojson"), temp / (name + ".json"), "2000x1200",
                     args.mapshaper, filters)
            geo = json.loads((temp / (name + ".json")).read_bytes())
            for feature in geo["features"]:
                feature["properties"] = {} if fields == "-" else {"rank": feature["properties"]["rank"]}
            hydro[name] = geo
        hydro["labels"] = place_labels()
        (OUT / "water.json").write_text(json.dumps(hydro, separators=(",", ":")))
    with Image.open(BASE / "relief.webp") as relief:
        relief.resize((1536, 1536), Image.Resampling.LANCZOS).save(
            OUT / "terrain.webp", quality=82, method=6
        )


if __name__ == "__main__":
    main()
