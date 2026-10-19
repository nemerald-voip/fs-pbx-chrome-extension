# GitHub hosting and Chrome Web Store releases

Prepared for `nemerald-voip/fs-pbx-chrome-extension`, starting with extension 1.0.8.
This repository contains the extension source and release workflows. Google
authentication still needs to be configured. No Chrome Web Store upload or
submission has been performed by these files.

GitHub stores the source, change history, tests and release downloads. Chrome Web
Store hosts the installed extension and delivers approved updates. No separate
VPS, application server or GitHub Pages deployment is needed for the extension.
Its FS PBX API server remains your existing server. GitHub ZIP downloads do not
auto-update unpacked installations.

## 1. Work with the source repository

The source is hosted at <https://github.com/nemerald-voip/fs-pbx-chrome-extension>.
Clone it with GitHub Desktop or Git:

```bash
git clone https://github.com/nemerald-voip/fs-pbx-chrome-extension.git
cd fs-pbx-chrome-extension
```

The repository is public. Keep credentials and tenant configuration out of the
source. No open-source license has been selected yet; public visibility alone
does not grant an open-source license.

The store uploader can remain unconfigured while Google verifies your account.
Normal pushes and pull requests run checks and produce a downloadable ZIP in
**Actions > Check extension**. Open a successful run and download its artifact.
For unpacked testing, use the extracted runtime ZIP or load this source folder
through `chrome://extensions`.

## 2. How the prepared workflows behave

| Event | Result |
| --- | --- |
| Branch push or pull request | Run tests and build a ZIP; no store access |
| Push a new version tag such as `v1.0.9` | Test, package, create a GitHub Release with ZIP and checksum |
| Tag push with `CWS_AUTOMATION_ENABLED=true` | Also upload and submit to Google for review |
| Manually run Release extension with `none` | Build/release only |
| Manually run with `upload` | Upload a store draft, without requesting review |
| Manually run with `publish` | Upload and submit for review, then publish after approval |

Manual actions are explicit and work independently of the automatic-submission
flag. Leave that flag unset while verification is pending. The workflow never
requests a review bypass. It stops on store validation warnings, failed uploads,
an existing pending/staged submission, or a version that is not newer than the
published version. It does not cancel submissions or change listing visibility.
API requests are not automatically retried after ambiguous network failures;
inspect the dashboard before retrying.

The package builder uses an explicit runtime-file list, so tests, CI files,
documentation and Google credentials cannot enter the store ZIP. Add new runtime
assets to `FILES` in `scripts/package.py` when the extension gains them. The
source bundle itself is not the ZIP to upload to Google; use the generated
`dist/fs-pbx-click-to-dial-VERSION.zip`.

## 3. Complete the first Chrome listing

After verification, create the store item in the Developer Dashboard and upload
the extension ZIP. Complete the listing, images, privacy disclosures, review
instructions and distribution choice. Publish the first version through the
dashboard so that those choices are established. Record:

- **Publisher ID:** Publisher > Settings in the Chrome Web Store dashboard.
- **Extension ID:** the store item's 32-letter ID. This is not an unpacked
  development installation's ID.

Future uploads must update this same item. If you change its visibility later,
publish that visibility change manually once before using API publishing again.

## 4. Connect GitHub Actions to Google without saving a permanent key

This workflow uses Google's authentication action with Workload Identity
Federation and a dedicated service account. GitHub obtains a short-lived token;
there is no FS PBX API token or Google private key in this repository.

1. Create or select a Google Cloud project. Enable **Chrome Web Store API**.
2. Create a service account such as `chrome-store-publisher`.
3. In the Chrome Web Store Developer Dashboard's Account section, add that
   service account's email. This grants it authority over the publisher's items.
4. Configure the Google trust relationship below, then add the GitHub variables.

Use Google Cloud Shell or an authenticated `gcloud` CLI. Replace the Google Cloud project ID. The numeric repository and owner IDs below
were resolved from `nemerald-voip/fs-pbx-chrome-extension`.

```bash
PROJECT_ID='YOUR_GOOGLE_CLOUD_PROJECT_ID'
REPOSITORY_ID='1426137280'
OWNER_ID='58834187'
REPOSITORY='nemerald-voip/fs-pbx-chrome-extension'
SERVICE_ACCOUNT="chrome-store-publisher@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable chromewebstore.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT_ID"
gcloud iam service-accounts create chrome-store-publisher --project="$PROJECT_ID" --display-name='Chrome Web Store publisher'
gcloud iam workload-identity-pools create github-chrome-store --project="$PROJECT_ID" --location=global --display-name='FS PBX extension releases'
POOL_NAME=$(gcloud iam workload-identity-pools describe github-chrome-store --project="$PROJECT_ID" --location=global --format='value(name)')

gcloud iam workload-identity-pools providers create-oidc extension-releases \
  --project="$PROJECT_ID" --location=global --workload-identity-pool=github-chrome-store \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name,attribute.workflow_ref=assertion.workflow_ref' \
  --attribute-condition="assertion.repository_owner_id == '${OWNER_ID}' && assertion.repository_id == '${REPOSITORY_ID}' && assertion.workflow_ref.startsWith('${REPOSITORY}/.github/workflows/release.yml@') && ((assertion.event_name == 'push' && assertion.ref.startsWith('refs/tags/v')) || (assertion.event_name == 'workflow_dispatch' && assertion.ref == 'refs/heads/main'))"

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${REPOSITORY_ID}"

gcloud iam workload-identity-pools providers describe extension-releases \
  --project="$PROJECT_ID" --location=global --workload-identity-pool=github-chrome-store --format='value(name)'
```

If you created the service account in the console, skip its create command.
Run each creation step once. Allow a few minutes for IAM changes to propagate.
Manual releases should run the workflow from `main`, with the desired existing
version tag in its input; the Google condition intentionally allows that path
and version-tag push events only. Keep release tags unchanged once created.

Under the GitHub repository's **Settings > Secrets and variables > Actions >
Variables**, add these repository variables:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider name printed by the last command |
| `CWS_SERVICE_ACCOUNT` | Service account email added to the Chrome dashboard |
| `CWS_PUBLISHER_ID` | Dashboard publisher ID |
| `CWS_EXTENSION_ID` | Store item's extension ID |
| `CWS_AUTOMATION_ENABLED` | Leave unset initially; set to `true` for tag-triggered submission |

These are configuration identifiers, not secret keys. The workflow requests the
`https://www.googleapis.com/auth/chromewebstore` scope explicitly. Restrict who
can write this repository and create release tags, since those users can release
the extension. If authentication fails, verify the provider condition, service
account linkage and IDs; do not add broad project-owner permissions as a fix.

## 5. Release future changes

1. Change the source, update `manifest.json` and `package.json` to the same new
   version, such as `1.0.9`, and record the changes in the README/release notes.
2. Run `npm test`, `python3 -m unittest discover -s scripts -p 'test_*.py'`, and
   `python3 scripts/package.py`. Test the actual extension against an appropriate
   FS PBX test account before releasing phone-control behavior changes.
3. Commit and push to `main`; check that **Check extension** passes.
4. Create and push the matching tag:

   ```bash
   git tag v1.0.9
   git push origin v1.0.9
   ```

5. Open **Actions > Release extension**. When automatic submission is enabled,
   a successful run means Google accepted the submission; it does not mean the
   review has finished or every user's Chrome has updated.

To test Google authentication first, use a new version/tag with automatic
submission disabled, then run **Release extension** manually from `main` with
`store_action=upload`. Complete that draft's submission in the Google dashboard.
Use the next version for your first fully automatic tag release.

Do not reuse the already published `1.0.8` version for an update. If a submission
fails after upload, inspect the dashboard and finish the draft there when
appropriate rather than repeatedly re-uploading the same version. GitHub release
assets are not overwritten on reruns. Correct a released mistake with a new
version containing the fix or reverted code.

Users who installed through Chrome Web Store receive approved updates through
Chrome's normal update process. Unpacked test copies remain manual installations.

## Validation and references

The existing extension tests and additional mock publishing tests are runnable
locally. Check the GitHub Actions run for this commit for its CI result. Google
authentication and Chrome Web Store upload require the configuration above and
have not yet been tested end to end.

- [Chrome Web Store API setup](https://developer.chrome.com/docs/webstore/using-api)
- [Chrome service accounts](https://developer.chrome.com/docs/webstore/service-accounts)
- [Google's GitHub authentication action](https://github.com/google-github-actions/auth)
- [Upload API](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload)
- [Publish API](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)
- [Chrome update lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle)
