#!/bin/bash

echo "🚀 Setting up WhatsApp Chatbot Platform..."

# Check if Node.js is installed
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null
then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✅ npm version: $(npm --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env file with your configuration"
    echo ""
    echo "Required environment variables:"
    echo "  - SUPABASE_URL"
    echo "  - SUPABASE_ANON_KEY"
    echo "  - SUPABASE_SERVICE_ROLE_KEY"
    echo "  - WHATSAPP_VERIFY_TOKEN"
    echo "  - JWT_SECRET"
    echo ""
    echo "After editing .env, run: npm start"
else
    echo "✅ .env file found"
fi

# Create logs directory if it doesn't exist
mkdir -p logs

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Configure your .env file"
echo "  2. Run database migrations in Supabase"
echo "  3. Start the server: npm start"
echo ""
echo "Documentation:"
echo "  - README.md - Getting started guide"
echo "  - API_DOCUMENTATION.md - Complete API reference"
echo "  - DEPLOYMENT.md - Deployment guide"
echo "  - postman_collection.json - Postman collection for testing"
echo ""
