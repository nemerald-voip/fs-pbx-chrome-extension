"""Build a reproducible, runtime-only Chrome Web Store ZIP (Python 3 stdlib)."""
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "manifest.json", "background.js", "content.js", "core.js", "options.html",
    "options.js", "popup.html", "popup.js", "site-access.js", "styles.css",
    "ui.js", "website-links.js", "icons/16.png", "icons/32.png", "icons/48.png",
    "icons/128.png",
)


def build(root=ROOT, release_tag=None):
    manifest = json.loads((root / "manifest.json").read_text())
    version = manifest["version"]
    parts = version.split(".")
    if (not re.fullmatch(r"[0-9]+(?:\.[0-9]+){0,3}", version)
            or any(int(p) > 65535 or str(int(p)) != p for p in parts)
            or not any(int(p) for p in parts)):
        raise ValueError("Invalid Chrome extension version")
    if manifest.get("manifest_version") != 3:
        raise ValueError("Expected Manifest V3")
    if json.loads((root / "package.json").read_text())["version"] != version:
        raise ValueError("package.json and manifest.json versions must match")
    if release_tag and release_tag != "v" + version:
        raise ValueError(f"Release tag must be v{version}")
    for name in FILES:
        path = root / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f"Missing or invalid runtime file: {name}")
    out = root / "dist"
    out.mkdir(exist_ok=True)
    target = out / f"fs-pbx-click-to-dial-{version}.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(FILES):
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (root / name).read_bytes())
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(".zip.sha256").write_text(f"{digest}  {target.name}\n")
    return target, version


if __name__ == "__main__":
    path, version = build(release_tag=os.environ.get("RELEASE_TAG"))
    print(f"Built {path.name} ({path.stat().st_size} bytes)")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"package=dist/{path.name}\nversion={version}\n")
