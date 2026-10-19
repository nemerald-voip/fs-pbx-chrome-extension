"""Upload a package and optionally submit it using Chrome Web Store API v2."""
import argparse
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request
import zipfile


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class StoreClient:
    def __init__(self, publisher, item, token):
        if not re.fullmatch(r"[A-Za-z0-9_-]+", publisher or ""):
            raise ValueError("Set CWS_PUBLISHER_ID to the dashboard publisher ID")
        if not re.fullmatch(r"[a-p]{32}", item or ""):
            raise ValueError("Set CWS_EXTENSION_ID to the 32-letter store item ID")
        if not token:
            raise ValueError("CWS_ACCESS_TOKEN is missing")
        self.name = f"publishers/{publisher}/items/{item}"
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, action, data=None, upload=False):
        prefix = "upload/v2" if upload else "v2"
        url = f"https://chromewebstore.googleapis.com/{prefix}/{self.name}:{action}"
        headers = {"Authorization": f"Bearer {self.token}"}
        if data is not None:
            headers["Content-Type"] = "application/zip" if upload else "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=90) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            # Never print request headers, tokens, or a full upstream response.
            try:
                body = json.loads(error.read())
                message = body.get("error", {}).get("message", "Request failed")
            except (ValueError, AttributeError):
                message = "Request failed; inspect the Chrome Web Store dashboard"
            message = str(message).replace(self.token, "[REDACTED]")[:1200]
            raise RuntimeError(f"Chrome Web Store HTTP {error.code}: {message}") from None
        if not isinstance(result, dict):
            raise RuntimeError("Unexpected Chrome Web Store response")
        return result


def upload_and_submit(client, package, publish=False, sleep=time.sleep, attempts=30):
    with zipfile.ZipFile(package) as archive:
        expected = json.loads(archive.read("manifest.json"))["version"]
    status = client.request("GET", "fetchStatus")
    submitted = status.get("submittedItemRevisionStatus", {})
    if submitted.get("state") in {"PENDING_REVIEW", "STAGED"}:
        raise RuntimeError("A submission is already pending or staged. Resolve it in the dashboard first.")
    existing = status.get("publishedItemRevisionStatus", {}).get("distributionChannels", [])
    def version_tuple(value):
        parts = tuple(int(p) for p in value.split("."))
        return parts + (0,) * (4 - len(parts))
    for channel in existing:
        if channel.get("crxVersion") and version_tuple(expected) <= version_tuple(channel["crxVersion"]):
            raise RuntimeError("Increase the manifest/package version above the published version")
    response = client.request("POST", "upload", Path(package).read_bytes(), upload=True)
    state = response.get("uploadState")
    # The enum reference uses IN_PROGRESS; some prose/examples use the prefixed name.
    pending = {"IN_PROGRESS", "UPLOAD_IN_PROGRESS"}
    success = {"SUCCEEDED", "UPLOAD_SUCCESS"}
    for _ in range(attempts):
        if state not in pending:
            break
        sleep(5)
        state = client.request("GET", "fetchStatus").get("lastAsyncUploadState")
    if state not in success:
        raise RuntimeError(f"Upload did not complete successfully ({state}). No publish request was sent.")
    if response.get("crxVersion") and response["crxVersion"] != expected:
        raise RuntimeError("Store upload version did not match this package; stopping")
    print(f"Chrome Web Store accepted the package for version {expected}.")
    if not publish:
        print("Upload only: the package has NOT been submitted for review.")
        return "UPLOADED"
    result = client.request("POST", "publish", json.dumps({
        "publishType": "DEFAULT_PUBLISH", "skipReview": False, "blockOnWarnings": True,
    }).encode())
    state = result.get("state")
    if state not in {"PENDING_REVIEW", "PUBLISHED", "PUBLISHED_TO_TESTERS", "STAGED"}:
        raise RuntimeError(f"Unexpected submission state: {state}; inspect the dashboard")
    print(f"Chrome Web Store submission state: {state}. Approval and client updates are separate steps.")
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--publish", action="store_true", help="Submit for review and publish after approval")
    args = parser.parse_args()
    client = StoreClient(os.environ.get("CWS_PUBLISHER_ID"), os.environ.get("CWS_EXTENSION_ID"),
                         os.environ.get("CWS_ACCESS_TOKEN"))
    upload_and_submit(client, args.package, args.publish)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Release stopped: {error}", file=sys.stderr)
        sys.exit(1)
