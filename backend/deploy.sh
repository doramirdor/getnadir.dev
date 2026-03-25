#!/bin/bash

# Nadir LLM Routing Platform - GCP Deployment Script
# This script deploys the application to Google App Engine

set -e  # Exit on any error

echo "🚀 Starting Nadir deployment to Google App Engine..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Not authenticated with gcloud. Please run:"
    echo "   gcloud auth login"
    exit 1
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No GCP project set. Please run:"
    echo "   gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "📋 Deploying to project: $PROJECT_ID"

# Check if App Engine is enabled
if ! gcloud app describe --project=$PROJECT_ID &> /dev/null; then
    echo "⚠️  App Engine is not initialized in this project."
    echo "   Would you like to initialize it? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "🔧 Please choose a region for App Engine:"
        echo "   Common options: us-central1, us-east1, europe-west1, asia-northeast1"
        echo "   Enter region:"
        read -r region
        gcloud app create --region=$region --project=$PROJECT_ID
    else
        echo "❌ App Engine must be initialized to deploy. Exiting."
        exit 1
    fi
fi

# Verify required files exist
echo "🔍 Checking required files..."
required_files=("app.yaml" "requirements.txt" "app/main.py")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ Required file missing: $file"
        exit 1
    fi
done
echo "✅ All required files present"

# Verify Two-Tower model exists
echo "🧠 Checking Two-Tower model..."
TWO_TOWER_MODEL="training/model_recommender/two_tower_complexity_aware_2025.pkl"
if [ ! -f "$TWO_TOWER_MODEL" ]; then
    echo "❌ Two-Tower model missing: $TWO_TOWER_MODEL"
    echo "   Please ensure the latest two-tower model is present for deployment"
    exit 1
fi
MODEL_SIZE=$(du -h "$TWO_TOWER_MODEL" | cut -f1)
echo "✅ Two-Tower model ready: $TWO_TOWER_MODEL ($MODEL_SIZE)"

# Check for secret management
echo "⚠️  IMPORTANT: Make sure you have configured the following secrets in Google Secret Manager:"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_SERVICE_KEY"
echo "   - SUPABASE_PROJECT_ID"
echo "   - OPENAI_API_KEY"
echo "   - ANTHROPIC_API_KEY" 
echo "   - GOOGLE_API_KEY"
echo ""
echo "   Or set them as environment variables in app.yaml"
echo ""
echo "   Continue with deployment? (y/n)"
read -r response
if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled. Please configure secrets first."
    exit 1
fi

# Optional: Run tests before deployment
echo "🧪 Would you like to run tests before deployment? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    echo "🧪 Running tests..."

    # Test Two-Tower model loading
    echo "🧠 Testing Two-Tower model loading..."
    python3 -c "
from app.complexity.analyzer_factory import ComplexityAnalyzerFactory
try:
    analyzer = ComplexityAnalyzerFactory.create_analyzer('two_tower', ['openai', 'anthropic'], ['gpt-4o-mini', 'claude-3-haiku-20240307'])
    print('✅ Two-Tower model loads successfully')
    print(f'📂 Model type: {analyzer._model_type}')
    print(f'💻 Device: {analyzer.device}')
    # Test a simple prediction
    result = analyzer.analyze_complexity('Test prompt for deployment', ['gpt-4o-mini'])
    print(f'🎯 Test prediction successful: {result[\"recommended_model\"]}')
except Exception as e:
    print(f'❌ Two-Tower model test failed: {e}')
    exit(1)
"

    # Test basic imports
    python3 -c "from app.main import app; print('✅ Main app imports successfully')"

    echo "✅ All tests completed"
fi

# Deploy to App Engine
echo "🚀 Deploying to App Engine..."
echo "⏳ This may take several minutes..."

# Deploy with explicit version for better tracking
VERSION=$(date +%Y%m%d-%H%M%S)
gcloud app deploy app.yaml \
    --version="v$VERSION" \
    --promote \
    --stop-previous-version \
    --project=$PROJECT_ID \
    --quiet

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    
    # Get the deployed URL
    URL=$(gcloud app browse --no-launch-browser --project=$PROJECT_ID 2>&1 | grep -o 'https://[^[:space:]]*')
    echo "🌐 Application URL: $URL"
    
    # Test the health endpoint
    echo "🔍 Testing health endpoint..."
    if curl -sf "$URL/health" > /dev/null; then
        echo "✅ Health check passed"
    else
        echo "⚠️  Health check failed - please check logs"
    fi
    
    # Show useful commands
    echo ""
    echo "📊 Useful commands:"
    echo "   View logs:    gcloud app logs tail -s default --project=$PROJECT_ID"
    echo "   View metrics: gcloud app browse --project=$PROJECT_ID"
    echo "   Update app:   ./deploy.sh"
    echo ""
    echo "🎉 Deployment complete!"
    
else
    echo "❌ Deployment failed! Check the logs above for details."
    exit 1
fi