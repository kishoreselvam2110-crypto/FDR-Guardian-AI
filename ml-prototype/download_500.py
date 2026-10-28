from datasets import load_dataset, Image as HFImage
from pathlib import Path
from PIL import Image as PILImage
import json
import re

REPO = "kriyam-ai/kriyam-tamperflow"
OUT = Path("ml-prototype/data/kriyam-500")
TARGET = 250

OUT.mkdir(parents=True, exist_ok=True)
images_dir = OUT / "images"
images_dir.mkdir(parents=True, exist_ok=True)

counts = {"authentic": 0, "tampered": 0}
seen_ids = set()
scanned = 0

print("Loading dataset in streaming mode...")
ds = load_dataset(REPO, split="train", streaming=True)
ds = ds.cast_column("image", HFImage(decode=True))
ds = ds.shuffle(seed=42, buffer_size=500)

manifest_path = OUT / "metadata.jsonl"

with manifest_path.open("w", encoding="utf-8") as manifest:
    for row in ds:
        scanned += 1

        source_id = str(row.get("id") or "").strip()
        raw_auth = str(row.get("is_authentic")).strip().lower()

        if raw_auth in ("true", "1", "yes"):
            label = "authentic"
        elif raw_auth in ("false", "0", "no"):
            label = "tampered"
        else:
            continue

        if not source_id or source_id in seen_ids:
            continue

        if counts[label] >= TARGET:
            continue

        try:
            img = row.get("image")
            if not isinstance(img, PILImage.Image):
                print(f"Skipping undecoded image: {source_id}")
                continue

            safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", source_id)
            tier = re.sub(r"[^A-Za-z0-9_-]", "_", str(row.get("tier") or "unknown"))
            filename = f"{safe_id}_{tier}.png"
            destination = images_dir / filename

            img.convert("RGB").save(destination, format="PNG")

            record = {
                "id": source_id,
                "tier": row.get("tier"),
                "label": label,
                "is_authentic": label == "authentic",
                "num_regions": row.get("num_regions"),
                "tamper_types": row.get("tamper_types"),
                "image_file": filename
            }

            manifest.write(json.dumps(record, default=str) + "\n")
            manifest.flush()

            seen_ids.add(source_id)
            counts[label] += 1

            if sum(counts.values()) % 25 == 0:
                print(f"Saved {sum(counts.values())}/500 | {counts}")

        except Exception as exc:
            print(f"Could not process {source_id}: {exc}")

        if all(n >= TARGET for n in counts.values()):
            break

        if scanned % 100 == 0:
            print(f"Scanned {scanned} rows | Saved: {counts}")

print("\nFinished.")
print("Scanned rows:", scanned)
print("Saved class counts:", counts)
print("Image folder:", images_dir.resolve())
print("Manifest:", manifest_path.resolve())

if sum(counts.values()) < 500:
    print("WARNING: Fewer than 500 unique images were saved.")
