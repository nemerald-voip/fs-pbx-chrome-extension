# Automatic Chrome Web Store updates

FS PBX Click to Dial has been approved and published in the Chrome Web Store.
This repository submits future updates from `main` once the one-time Google
publishing connection below is configured. Store approval alone does not give
GitHub permission to publish. No working Google connection has been verified yet.

## What happens when you push

| Event | Result |
| --- | --- |
| Push or merge commits into `main` | Test, build with an automatic version, upload and submit for review |
| Push another branch or open a pull request | Tests and a downloadable ZIP only; no store access |
| Scheduled check at minutes 17 and 47 each hour | Retry the latest `main` after a previous review/upload clears; skip versions already published |
| Run **Submit Chrome Web Store update**, action **check** | Test/build and verify Google access without uploading or submitting |
| Run that workflow, action **publish** | Submit the latest `main` immediately if the store is ready |
| Push a version tag such as `v1.0.9` | Optional GitHub Release and download; no Chrome submission |

Local commits must be **pushed to GitHub** to trigger this. Every push to main,
including documentation changes, is eligible. The workflow checks out the latest
main when it starts, so rapid commits or several commits in one push can share
one submission containing all their changes. It never publishes feature branches.

Google reviews updates and publishes them after approval. Existing submissions
are not cancelled. If an earlier version is in review, the run reports
`DEFERRED_REVIEW`; the scheduled check picks up the latest main afterward.
GitHub schedules can be delayed, and scheduled workflows in inactive public
repositories can be disabled by GitHub. New pushes still trigger submission.

A staged version requires you to publish or cancel it in the store dashboard.
Rejected/cancelled versions are not repeatedly resubmitted: address the reason
and push a new commit. Policy warnings, takedowns and unexpected states stop the
run. An API/network error fails the run; a later run reads store status before
doing anything, including when an earlier submission response was lost.

## Automatic versions

Keep the three-part source version in `manifest.json` and `package.json` equal.
For ordinary commits you do **not** need to edit either version or create a tag.

The store ZIP adds the full Git history's commit count as a fourth version part:
for example, base `1.0.8` at commit count 6 becomes `1.0.8.6`. The builder changes
only the manifest inside the ZIP, leaving source files untouched. It carries
revision overflow into the patch component after 65,535 commits.

A given source commit produces the same version and bytes on retries. This
prevents schedules and reruns from generating endless updates. A newer version
already in the store blocks an older build. Keep main history append-only; use
a revert commit for rollbacks instead of force-pushing history backwards. If a
manual store upload has advanced past the automatic version, raise both source
versions together before the next push.

## One-time Google connection

Use the existing published store listing. Record its **32-letter extension ID**
from the store URL and your **publisher ID** from the Chrome developer dashboard's
publisher settings. These identifiers are not passwords.

The workflow uses a dedicated Google service account and Workload Identity
Federation. It gets a short-lived token, so no Google private key or PBX token
needs to be stored in GitHub.

1. Create or select a Google Cloud project.
2. In GitHub's **Settings > Secrets and variables > Actions > Variables**, set
   `CWS_AUTOMATION_ENABLED=false` while setting up.
3. Run the following in Google Cloud Shell or an authenticated `gcloud` CLI.
   Replace `YOUR_GOOGLE_CLOUD_PROJECT_ID`. The repository and owner IDs below
   belong to `nemerald-voip/fs-pbx-chrome-extension`.

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

TRUST_CONDITION="assertion.repository_owner_id == '${OWNER_ID}' && assertion.repository_id == '${REPOSITORY_ID}' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '${REPOSITORY}/.github/workflows/release.yml@refs/heads/main' && assertion.event_name in ['push', 'schedule', 'workflow_dispatch']"

gcloud iam workload-identity-pools providers create-oidc extension-releases \
  --project="$PROJECT_ID" --location=global --workload-identity-pool=github-chrome-store \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name,attribute.workflow_ref=assertion.workflow_ref' \
  --attribute-condition="$TRUST_CONDITION"

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${REPOSITORY_ID}"

gcloud iam workload-identity-pools providers describe extension-releases \
  --project="$PROJECT_ID" --location=global --workload-identity-pool=github-chrome-store --format='value(name)'

echo "CWS_SERVICE_ACCOUNT=$SERVICE_ACCOUNT"
```

Run creation commands once; skip resources you already created. If you configured
the previous tag-based workflow, update the existing provider to trust main
pushes and scheduled retries using the `TRUST_CONDITION` above:

```bash
gcloud iam workload-identity-pools providers update-oidc extension-releases \
  --project="$PROJECT_ID" --location=global --workload-identity-pool=github-chrome-store \
  --attribute-condition="$TRUST_CONDITION"
```

4. Add the **service account email** to the Chrome Web Store publisher's
   **Account/Settings > Service account** field. This is separate from your
   verified contact email. Enable the Chrome Web Store API in the Cloud project.
5. Add these **repository Actions variables** in GitHub:

| Variable | Value |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name printed by the describe command |
| `CWS_SERVICE_ACCOUNT` | Service account email linked to your Chrome publisher |
| `CWS_PUBLISHER_ID` | Existing publisher ID from the dashboard |
| `CWS_EXTENSION_ID` | Existing published extension's 32-letter ID |
| `CWS_AUTOMATION_ENABLED` | `false` during setup; `true` when ready |

6. Allow a few minutes for Google IAM changes to propagate. In **Actions >
   Submit Chrome Web Store update > Run workflow**, choose branch **main** and
   action **check**. This works even while automation is paused. Confirm its
   authentication/status check succeeds.
7. Set `CWS_AUTOMATION_ENABLED=true` and run it once with action **publish**.
   Future main pushes submit automatically. The flag is an emergency pause:
   an unset flag also enables submissions if all four connection variables exist.

A push with missing connection variables fails clearly after building its ZIP;
it does not report a successful submission. Scheduled runs wait until all four
variables exist. An incorrect variable or missing service-account linkage fails
authentication/status checks. Never add broad Google project-owner permissions
to fix a publishing error.

Only trusted maintainers should be able to write to main or change these
workflows. The Google condition restricts access to this repository's numeric
IDs, this exact workflow, main and the three intended trigger types.

## Day-to-day use

Change the extension, run `npm test` and
`python3 -m unittest discover -s scripts -p 'test_*.py'`, then commit and push to
main. Test handset/API behavior changes against an appropriate FS PBX test account.
Check **Actions > Submit Chrome Web Store update** for the source commit,
package artifact and store result. Keep release history in `CHANGELOG.md`;
the README should describe current installation and usage.

The package builder includes only its explicit runtime allowlist. New runtime
assets must be added to `FILES` in `scripts/package.py`. Documentation, tests,
build scripts and credentials are excluded from the store ZIP.

GitHub stores the source and optional release downloads. Chrome Web Store
delivers approved updates to users who installed the store version. Unpacked
development installations still need manual reloads. No separate hosting server
or GitHub Pages deployment is needed.

Optional GitHub releases remain available through **Create GitHub release**:
update both source versions, push the matching tag, or manually run it with an
existing tag. Tag downloads use the source version; automatic Chrome packages
use the fourth build component. The tag workflow has no Google publishing access.

## Validation and references

Tests cover version ordering, deterministic packages, unchanged source files,
credential exclusion, read-only checks, deferred reviews and uploads, rejected
versions, duplicate prevention, and upload/submission failures. Live Google
authentication and submission must be verified using the check/publish runs above.

- [Chrome Web Store API setup](https://developer.chrome.com/docs/webstore/using-api)
- [Chrome service accounts](https://developer.chrome.com/docs/webstore/service-accounts)
- [Google GitHub authentication action](https://github.com/google-github-actions/auth)
- [Chrome version format](https://developer.chrome.com/docs/extensions/reference/manifest/version)
- [Store status API](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus)
- [Publish API](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)
