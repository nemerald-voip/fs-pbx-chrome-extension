import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from chrome_store import upload_and_submit
from package import build, FILES, ROOT


class FakeClient:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = []

    def request(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return next(self.responses)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.package = Path(self.temp.name) / "extension.zip"
        with zipfile.ZipFile(self.package, "w") as archive:
            archive.writestr("manifest.json", json.dumps({"version": "1.0.9"}))

    def test_upload_only_never_publishes(self):
        client = FakeClient([{}, {"uploadState": "SUCCEEDED", "crxVersion": "1.0.9"}])
        self.assertEqual(upload_and_submit(client, self.package), "UPLOADED")
        self.assertEqual([call[0][1] for call in client.calls], ["fetchStatus", "upload"])

    def test_waits_for_async_upload_before_submitting(self):
        client = FakeClient([{}, {"uploadState": "IN_PROGRESS"},
                             {"lastAsyncUploadState": "IN_PROGRESS"},
                             {"lastAsyncUploadState": "SUCCEEDED"}, {"state": "PENDING_REVIEW"}])
        self.assertEqual(upload_and_submit(client, self.package, True, sleep=lambda _: None), "PENDING_REVIEW")
        body = json.loads(client.calls[-1][0][2])
        self.assertFalse(body["skipReview"])
        self.assertTrue(body["blockOnWarnings"])

    def test_failed_or_unknown_upload_never_submits(self):
        for state in ["FAILED", "NOT_FOUND", None]:
            with self.subTest(state=state):
                client = FakeClient([{}, {"uploadState": state}])
                with self.assertRaises(RuntimeError):
                    upload_and_submit(client, self.package, True)
                self.assertNotIn("publish", [call[0][1] for call in client.calls])

    def test_poll_timeout_never_submits(self):
        client = FakeClient([{}, {"uploadState": "UPLOAD_IN_PROGRESS"},
                             {"lastAsyncUploadState": "IN_PROGRESS"}])
        with self.assertRaises(RuntimeError):
            upload_and_submit(client, self.package, True, sleep=lambda _: None, attempts=1)
        self.assertNotIn("publish", [call[0][1] for call in client.calls])

    def test_existing_review_is_not_replaced(self):
        client = FakeClient([{"submittedItemRevisionStatus": {"state": "PENDING_REVIEW"}}])
        with self.assertRaises(RuntimeError):
            upload_and_submit(client, self.package, True)
        self.assertEqual(len(client.calls), 1)

    def test_old_version_is_not_uploaded(self):
        client = FakeClient([{"publishedItemRevisionStatus": {
            "distributionChannels": [{"crxVersion": "1.0.10"}]}}])
        with self.assertRaises(RuntimeError):
            upload_and_submit(client, self.package, True)
        self.assertEqual(len(client.calls), 1)

    def test_runtime_allowlist_excludes_credentials_and_build_files(self):
        root = Path(self.temp.name) / "source"
        root.mkdir()
        for name in (*FILES, "package.json"):
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / name).read_bytes())
        (root / "gha-creds-example.json").write_text('{"private_key":"DO_NOT_PACKAGE"}')
        (root / ".env").write_text("TOKEN=DO_NOT_PACKAGE")
        version = json.loads((root / "manifest.json").read_text())["version"]
        path, _ = build(root, "v" + version)
        original = path.read_bytes()
        build(root, "v" + version)
        self.assertEqual(original, path.read_bytes())
        with zipfile.ZipFile(path) as archive:
            self.assertEqual(set(archive.namelist()), set(FILES))
        with self.assertRaises(ValueError):
            build(root, "v0.0.1")


if __name__ == "__main__":
    unittest.main()
