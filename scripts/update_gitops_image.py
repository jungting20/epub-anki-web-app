"""Update the EPUB reader image in a GitOps Kustomization (requires PyYAML)."""

import argparse
from pathlib import Path
import re

import yaml


def update_image(file: Path, image: str, digest: str) -> None:
    if not re.fullmatch(r"ghcr\.io/[a-z0-9._-]+/[a-z0-9._/-]+", image):
        raise ValueError("Invalid GHCR image name")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise ValueError("Invalid image digest")

    content = yaml.safe_load(file.read_text())
    if not isinstance(content, dict) or content.get("kind") != "Kustomization":
        raise ValueError("Expected a Kustomization")
    images = content.get("images")
    if not isinstance(images, list):
        raise ValueError("Expected an images list")
    matches = [
        entry
        for entry in images
        if isinstance(entry, dict) and entry.get("name") == "epub-reader"
    ]
    if len(matches) != 1:
        raise ValueError("Expected exactly one epub-reader image")

    entry = matches[0]
    if entry.get("newName") == image and entry.get("digest") == digest and "newTag" not in entry:
        return
    entry["newName"] = image
    entry.pop("newTag", None)
    entry["digest"] = digest
    file.write_text(yaml.safe_dump(content, sort_keys=False, allow_unicode=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("image")
    parser.add_argument("digest")
    args = parser.parse_args()
    update_image(args.file, args.image, args.digest)
