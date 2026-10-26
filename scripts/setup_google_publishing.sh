#!/usr/bin/env bash
# Run in Google Cloud Shell while signed in to the project owner's account.
# This configures only Google resources. Chrome linkage and GitHub variables
# remain explicit final setup steps. No service-account keys are created.
set -euo pipefail
trap 'echo "Setup stopped at line $LINENO. Resolve the reported error and rerun this script." >&2' ERR

command -v gcloud >/dev/null || { echo 'Open Google Cloud Shell to run this script.' >&2; exit 1; }

PROJECT_ID='fs-pbx-chrome-extension'
REPOSITORY_ID='1426137280'
OWNER_ID='58834187'
REPOSITORY='nemerald-voip/fs-pbx-chrome-extension'
PUBLISHER_ID='8ce782a1-16ea-4370-ad4e-e80fdbb8848e'
EXTENSION_ID='jpfhcbkhadfmhiblmpkmndhigpgmkoal'
SERVICE_ACCOUNT="chrome-store-publisher@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_ID='github-chrome-store'
PROVIDER_ID='extension-releases'

# Verify project access first; never silently use another active project.
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
[[ "$PROJECT_NUMBER" =~ ^[0-9]+$ ]] || { echo 'Could not resolve the Google project number.' >&2; exit 1; }

gcloud services enable chromewebstore.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com --project="$PROJECT_ID" --quiet

if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create chrome-store-publisher --project="$PROJECT_ID" \
    --display-name='Chrome Web Store publisher' --quiet
fi

if ! gcloud iam workload-identity-pools describe "$POOL_ID" \
    --project="$PROJECT_ID" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" --location=global --display-name='FS PBX extension releases' --quiet
fi

POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
ATTRIBUTE_MAPPING='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.event_name=assertion.event_name,attribute.workflow_ref=assertion.workflow_ref'
TRUST_CONDITION="assertion.repository_owner_id == '${OWNER_ID}' && assertion.repository_id == '${REPOSITORY_ID}' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == '${REPOSITORY}/.github/workflows/release.yml@refs/heads/main' && assertion.event_name in ['push', 'schedule', 'workflow_dispatch']"

if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  # Reruns also migrate the older tag-based trust condition to main pushes.
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping="$ATTRIBUTE_MAPPING" --attribute-condition="$TRUST_CONDITION" --quiet
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping="$ATTRIBUTE_MAPPING" --attribute-condition="$TRUST_CONDITION" --quiet
fi

# Add this one binding; preserve other IAM bindings. No project-wide roles.
gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" --role=roles/iam.workloadIdentityUser --condition=None \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${REPOSITORY_ID}" --quiet

PROVIDER_NAME=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" --format='value(name)')
[[ "$PROVIDER_NAME" == "$POOL_NAME/providers/$PROVIDER_ID" ]] || {
  echo 'Unexpected provider name. Check the Google configuration before continuing.' >&2
  exit 1
}

cat <<RESULT

Google publishing resources are configured.

Add this service account to the Chrome Web Store publisher's Account/Settings:
$SERVICE_ACCOUNT

Add these repository Actions VARIABLES in GitHub:
https://github.com/$REPOSITORY/settings/variables/actions

GCP_WORKLOAD_IDENTITY_PROVIDER=$PROVIDER_NAME
CWS_SERVICE_ACCOUNT=$SERVICE_ACCOUNT
CWS_PUBLISHER_ID=$PUBLISHER_ID
CWS_EXTENSION_ID=$EXTENSION_ID
CWS_AUTOMATION_ENABLED=false

Wait a few minutes, then run Submit Chrome Web Store update with action=check.
After that succeeds, set CWS_AUTOMATION_ENABLED=true and run action=publish.
Google resources alone do not activate submissions; complete those steps first.
RESULT
