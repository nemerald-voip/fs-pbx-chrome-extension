"""Build a reproducible, runtime-only Chrome Web Store ZIP (Python 3 stdlib)."""
import argparse
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


def version_tuple(version):
    parts = version.split(".")
    if (not re.fullmatch(r"[0-9]+(?:\.[0-9]+){0,3}", version)
            or any(int(p) > 65535 or str(int(p)) != p for p in parts)
            or not any(int(p) for p in parts)):
        raise ValueError("Invalid Chrome extension version")
    return tuple(int(p) for p in parts) + (0,) * (4 - len(parts))


def automatic_version(base, build_number):
    """Stable per source commit; rerunning a job must not invent another version."""
    version_tuple(base)
    if len(base.split(".")) != 3:
        raise ValueError("Automatic releases require a three-part source version")
    if isinstance(build_number, bool) or not isinstance(build_number, int) or build_number < 1:
        raise ValueError("Build number must be a positive full-history commit count")
    major, minor, patch = (int(p) for p in base.split("."))
    carry, revision = divmod(build_number, 65536)
    result = f"{major}.{minor}.{patch + carry}.{revision}"
    version_tuple(result)
    return result


def build(root=ROOT, release_tag=None, build_number=None):
    manifest = json.loads((root / "manifest.json").read_text())
    version = manifest["version"]
    version_tuple(version)
    if manifest.get("manifest_version") != 3:
        raise ValueError("Expected Manifest V3")
    if json.loads((root / "package.json").read_text())["version"] != version:
        raise ValueError("package.json and manifest.json versions must match")
    if release_tag and release_tag != "v" + version:
        raise ValueError(f"Release tag must be v{version}")
    if build_number is not None:
        if release_tag:
            raise ValueError("Choose either an automatic build or a version tag")
        version = automatic_version(version, build_number)
        manifest["version"] = version
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
            content = (root / name).read_bytes()
            if name == "manifest.json" and build_number is not None:
                content = (json.dumps(manifest, indent=2) + "\n").encode()
            archive.writestr(info, content)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(".zip.sha256").write_text(f"{digest}  {target.name}\n")
    return target, version


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-number", type=int, help="Full-history commit count for an automatic release")
    args = parser.parse_args()
    path, version = build(release_tag=os.environ.get("RELEASE_TAG"), build_number=args.build_number)
    print(f"Built {path.name} ({path.stat().st_size} bytes)")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"package=dist/{path.name}\nversion={version}\n")
