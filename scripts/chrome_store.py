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
from package import version_tuple


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


def automatic_decision(status, expected):
    """Read before every mutation, including scheduled retries after lost responses."""
    if status.get("takenDown") or status.get("warned"):
        raise RuntimeError("The item has a policy warning or takedown. Resolve it in the store dashboard.")
    wanted = version_tuple(expected)
    published = status.get("publishedItemRevisionStatus", {})
    submitted = status.get("submittedItemRevisionStatus", {})
    known_states = {"PENDING_REVIEW", "STAGED", "PUBLISHED", "PUBLISHED_TO_TESTERS", "REJECTED", "CANCELLED"}
    for revision in (published, submitted):
        if revision and revision.get("state") not in known_states:
            raise RuntimeError("Unknown store revision state; inspect the dashboard before uploading.")
    current = [version_tuple(c["crxVersion"]) for c in published.get("distributionChannels", [])
               if c.get("crxVersion")]
    if any(version > wanted for version in current):
        raise RuntimeError("Store version is newer than this build. Increase the source version; do not rewind main.")
    if current and all(version == wanted for version in current):
        return "ALREADY_PUBLISHED"
    if submitted.get("state") == "STAGED":
        return "STAGED_REQUIRES_PUBLISH"
    if submitted.get("state") == "PENDING_REVIEW":
        return "DEFERRED_REVIEW"
    submitted_versions = [version_tuple(c["crxVersion"]) for c in submitted.get("distributionChannels", [])
                          if c.get("crxVersion")]
    if submitted.get("state") in {"REJECTED", "CANCELLED"}:
        if not submitted_versions or any(version >= wanted for version in submitted_versions):
            raise RuntimeError("This submission was rejected/cancelled. Resolve the issue and push a new commit.")
    if status.get("lastAsyncUploadState") in {"IN_PROGRESS", "UPLOAD_IN_PROGRESS"}:
        return "DEFERRED_UPLOAD"
    return "READY"


def upload_and_submit(client, package, publish=False, sleep=time.sleep, attempts=30,
                      automatic=False, check_only=False):
    with zipfile.ZipFile(package) as archive:
        expected = json.loads(archive.read("manifest.json"))["version"]
    status = client.request("GET", "fetchStatus")
    if automatic or check_only:
        decision = automatic_decision(status, expected)
        if decision != "READY" or check_only:
            print(f"Chrome Web Store preflight for {expected}: {decision}. No upload or publish request sent.")
            return decision
    submitted = status.get("submittedItemRevisionStatus", {})
    if submitted.get("state") in {"PENDING_REVIEW", "STAGED"}:
        raise RuntimeError("A submission is already pending or staged. Resolve it in the dashboard first.")
    existing = status.get("publishedItemRevisionStatus", {}).get("distributionChannels", [])
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
    parser.add_argument("--automatic", action="store_true", help="Skip published versions and defer while Google reviews an update")
    parser.add_argument("--check", action="store_true", help="Check authentication and status without changing the store")
    args = parser.parse_args()
    client = StoreClient(os.environ.get("CWS_PUBLISHER_ID"), os.environ.get("CWS_EXTENSION_ID"),
                         os.environ.get("CWS_ACCESS_TOKEN"))
    state = upload_and_submit(client, args.package, args.publish,
                              automatic=args.automatic, check_only=args.check)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"state={state}\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        explanations = {
            "DEFERRED_REVIEW": "An earlier submission is still in review. The scheduled workflow will retry the latest main after it clears.",
            "DEFERRED_UPLOAD": "An upload is still processing. The scheduled workflow will check again.",
            "STAGED_REQUIRES_PUBLISH": "A staged submission must be published or cancelled in the dashboard before newer updates can proceed.",
            "ALREADY_PUBLISHED": "This version is already published. No duplicate submission was made.",
            "READY": "Authentication and preflight succeeded. Check mode made no store changes.",
        }
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write(f"\nChrome Web Store result: **{state}**.\n\n")
            summary.write(explanations.get(state, "Google review and delivery to installed browsers are separate from this workflow.") + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Release stopped: {error}", file=sys.stderr)
        sys.exit(1)
