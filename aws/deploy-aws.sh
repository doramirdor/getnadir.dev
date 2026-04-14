#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
#  Nadir — Deploy to AWS (ECR + App Runner)
#
#  Prerequisites:
#    - AWS CLI v2 configured (aws configure)
#    - Docker installed and running
#    - AWS startup credits active on the account
#
#  Usage:
#    ./aws/deploy-aws.sh              # First deploy (creates everything)
#    ./aws/deploy-aws.sh --update     # Update existing deployment
# ──────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ─────────────────────────────────────────────────────
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")
ECR_REPO="nadir-backend"
APP_NAME="nadir-backend-api"
IMAGE_TAG="latest"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
err()  { echo -e "${RED}[deploy]${NC} $1"; exit 1; }

# ── Checks ─────────────────────────────────────────────────────
if [ -z "$AWS_ACCOUNT_ID" ]; then
    err "AWS CLI not configured. Run: aws configure"
fi

if ! docker info &>/dev/null; then
    err "Docker is not running"
fi

log "AWS Account: $AWS_ACCOUNT_ID"
log "Region: $AWS_REGION"

# ── Step 1: Create ECR repository (if needed) ─────────────────
log "Checking ECR repository..."
if ! aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" &>/dev/null; then
    log "Creating ECR repository: $ECR_REPO"
    aws ecr create-repository \
        --repository-name "$ECR_REPO" \
        --region "$AWS_REGION" \
        --image-scanning-configuration scanOnPush=true \
        --encryption-configuration encryptionType=AES256
else
    log "ECR repository exists"
fi

ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO"

# ── Step 2: Build and push Docker image ────────────────────────
log "Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
    docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

log "Building Docker image..."
cd "$(dirname "$0")/.."
docker build \
    --platform linux/amd64 \
    -t "$ECR_REPO:$IMAGE_TAG" \
    --build-arg VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-}" \
    --build-arg VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-}" \
    --build-arg VITE_API_URL="${VITE_API_URL:-/api}" \
    .

log "Tagging and pushing to ECR..."
docker tag "$ECR_REPO:$IMAGE_TAG" "$ECR_URI:$IMAGE_TAG"
docker push "$ECR_URI:$IMAGE_TAG"
log "Image pushed: $ECR_URI:$IMAGE_TAG"

# ── Step 3: Deploy to App Runner ───────────────────────────────
if [ "${1:-}" = "--update" ]; then
    log "Updating App Runner service..."
    SERVICE_ARN=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='$APP_NAME'].ServiceArn" --output text --region "$AWS_REGION")
    if [ -z "$SERVICE_ARN" ]; then
        err "Service $APP_NAME not found. Run without --update first."
    fi
    aws apprunner start-deployment --service-arn "$SERVICE_ARN" --region "$AWS_REGION"
    log "Deployment triggered for $APP_NAME"
else
    # Check if service already exists
    EXISTING=$(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='$APP_NAME'].ServiceArn" --output text --region "$AWS_REGION" 2>/dev/null || echo "")
    if [ -n "$EXISTING" ]; then
        warn "Service $APP_NAME already exists. Use --update to redeploy."
        warn "Service ARN: $EXISTING"
        exit 0
    fi

    log "Creating App Runner service: $APP_NAME"

    # Create App Runner access role for ECR (if needed)
    ROLE_NAME="AppRunnerECRAccessRole"
    if ! aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
        log "Creating IAM role for App Runner ECR access..."
        aws iam create-role \
            --role-name "$ROLE_NAME" \
            --assume-role-policy-document '{
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "build.apprunner.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            }'
        aws iam attach-role-policy \
            --role-name "$ROLE_NAME" \
            --policy-arn "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
        sleep 10  # Wait for role propagation
    fi
    ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

    aws apprunner create-service \
        --service-name "$APP_NAME" \
        --region "$AWS_REGION" \
        --source-configuration "{
            \"AuthenticationConfiguration\": {
                \"AccessRoleArn\": \"$ROLE_ARN\"
            },
            \"AutoDeploymentsEnabled\": true,
            \"ImageRepository\": {
                \"ImageIdentifier\": \"$ECR_URI:$IMAGE_TAG\",
                \"ImageRepositoryType\": \"ECR\",
                \"ImageConfiguration\": {
                    \"Port\": \"8000\",
                    \"RuntimeEnvironmentVariables\": {
                        \"ENVIRONMENT\": \"production\",
                        \"DEBUG\": \"False\",
                        \"PYTHONUNBUFFERED\": \"1\"
                    }
                }
            }
        }" \
        --instance-configuration "{
            \"Cpu\": \"1024\",
            \"Memory\": \"2048\"
        }" \
        --health-check-configuration "{
            \"Protocol\": \"HTTP\",
            \"Path\": \"/health\",
            \"Interval\": 10,
            \"Timeout\": 5,
            \"HealthyThreshold\": 1,
            \"UnhealthyThreshold\": 5
        }"

    log "App Runner service creating... (takes 2-5 minutes)"
    log ""
    log "Next steps:"
    log "  1. Set env vars in AWS Console → App Runner → $APP_NAME → Configuration → Environment variables:"
    log "     SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY"
    log "     STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID_BASE"
    log "     ANTHROPIC_API_KEY, OPENAI_API_KEY"
    log "     ADMIN_API_KEY (for manual invoice triggers)"
    log ""
    log "  2. Get the service URL:"
    log "     aws apprunner list-services --query \"ServiceSummaryList[?ServiceName=='$APP_NAME'].ServiceUrl\" --output text"
    log ""
    log "  3. Update Stripe webhook URL to: https://<service-url>/v1/stripe/webhook"
    log "  4. Update dashboard VITE_API_URL to: https://<service-url>"
fi
