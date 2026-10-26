import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from chrome_store import upload_and_submit
from package import automatic_version, build, FILES, ROOT


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

    def test_automatic_version_is_stable_and_increases_per_commit(self):
        self.assertEqual(automatic_version("1.0.8", 6), "1.0.8.6")
        self.assertEqual(automatic_version("1.0.8", 6), automatic_version("1.0.8", 6))
        self.assertEqual(automatic_version("1.0.8", 7), "1.0.8.7")
        self.assertEqual(automatic_version("1.0.8", 65536), "1.0.9.0")
        for base, count in [("1.0.8.1", 6), ("1.00.8", 6), ("1.0.8", 0),
                            ("1.0.8", -1), ("1.0.8", True), ("1.0.65535", 65536)]:
            with self.subTest(base=base, count=count), self.assertRaises(ValueError):
                automatic_version(base, count)

    def test_check_mode_cannot_upload_even_with_publish_option(self):
        client = FakeClient([{}])
        self.assertEqual(upload_and_submit(client, self.package, True, check_only=True), "READY")
        self.assertEqual([call[0][0] for call in client.calls], ["GET"])

    def test_scheduled_retry_skips_an_already_published_version(self):
        client = FakeClient([{"publishedItemRevisionStatus": {
            "state": "PUBLISHED", "distributionChannels": [{"crxVersion": "1.0.9.0"}]}}])
        self.assertEqual(upload_and_submit(client, self.package, True, automatic=True), "ALREADY_PUBLISHED")
        self.assertEqual(len(client.calls), 1)

    def test_pending_review_defers_then_next_run_submits_new_changes(self):
        client = FakeClient([
            {"submittedItemRevisionStatus": {"state": "PENDING_REVIEW"}},
            {"publishedItemRevisionStatus": {
                "state": "PUBLISHED", "distributionChannels": [{"crxVersion": "1.0.8"}]}},
            {"uploadState": "SUCCEEDED", "crxVersion": "1.0.9"},
            {"state": "PENDING_REVIEW"},
        ])
        self.assertEqual(upload_and_submit(client, self.package, True, automatic=True), "DEFERRED_REVIEW")
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(upload_and_submit(client, self.package, True, automatic=True), "PENDING_REVIEW")
        self.assertEqual([call[0][1] for call in client.calls],
                         ["fetchStatus", "fetchStatus", "upload", "publish"])

    def test_staged_submission_is_not_cancelled_or_published_automatically(self):
        client = FakeClient([{"submittedItemRevisionStatus": {"state": "STAGED"}}])
        self.assertEqual(upload_and_submit(client, self.package, True, automatic=True), "STAGED_REQUIRES_PUBLISH")
        self.assertEqual(len(client.calls), 1)

    def test_ambiguous_publish_response_is_not_retried_while_in_review(self):
        client = FakeClient([{"submittedItemRevisionStatus": {
            "state": "PENDING_REVIEW", "distributionChannels": [{"crxVersion": "1.0.9"}]}}])
        self.assertEqual(upload_and_submit(client, self.package, True, automatic=True), "DEFERRED_REVIEW")
        self.assertEqual(len(client.calls), 1)

    def test_automatic_mode_refuses_newer_store_versions_and_policy_flags(self):
        statuses = [
            {"publishedItemRevisionStatus": {
                "state": "PUBLISHED", "distributionChannels": [{"crxVersion": "1.0.10"}]}},
            {"warned": True}, {"takenDown": True},
            {"submittedItemRevisionStatus": {"state": "UNKNOWN_FUTURE_STATE"}},
        ]
        for status in statuses:
            with self.subTest(status=status):
                client = FakeClient([status])
                with self.assertRaises(RuntimeError):
                    upload_and_submit(client, self.package, True, automatic=True)
                self.assertEqual(len(client.calls), 1)

    def test_same_rejected_or_cancelled_version_is_not_repeatedly_submitted(self):
        for state in ["REJECTED", "CANCELLED"]:
            client = FakeClient([{"submittedItemRevisionStatus": {
                "state": state, "distributionChannels": [{"crxVersion": "1.0.9"}]}}])
            with self.assertRaises(RuntimeError):
                upload_and_submit(client, self.package, True, automatic=True)
            self.assertEqual(len(client.calls), 1)

    def test_new_commit_can_replace_an_older_rejected_submission(self):
        client = FakeClient([
            {"submittedItemRevisionStatus": {
                "state": "REJECTED", "distributionChannels": [{"crxVersion": "1.0.8"}]}},
            {"uploadState": "SUCCEEDED"}, {"state": "PENDING_REVIEW"}])
        self.assertEqual(upload_and_submit(client, self.package, True, automatic=True), "PENDING_REVIEW")

    def test_outstanding_async_upload_defers_without_mutation(self):
        client = FakeClient([{"lastAsyncUploadState": "IN_PROGRESS"}])
        self.assertEqual(upload_and_submit(client, self.package, True, automatic=True), "DEFERRED_UPLOAD")
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
        originals = {name: (root / name).read_bytes() for name in (*FILES, "package.json")}
        automatic_package, automatic = build(root, build_number=6)
        self.assertEqual(automatic, automatic_version(version, 6))
        expected_bytes = automatic_package.read_bytes()
        build(root, build_number=6)
        self.assertEqual(expected_bytes, automatic_package.read_bytes())
        with zipfile.ZipFile(automatic_package) as archive:
            self.assertEqual(set(archive.namelist()), set(FILES))
            self.assertEqual(json.loads(archive.read("manifest.json"))["version"], automatic)
            for name in FILES:
                if name != "manifest.json":
                    self.assertEqual(archive.read(name), originals[name])
        for name, content in originals.items():
            self.assertEqual((root / name).read_bytes(), content)
        with self.assertRaises(ValueError):
            build(root, "v" + version, build_number=6)


if __name__ == "__main__":
    unittest.main()
