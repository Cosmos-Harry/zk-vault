#!/bin/bash

# ZK Vault Extension - Force Reload Script
# This script helps clear Chrome's aggressive caching

echo "🔄 ZK Vault Extension - Force Reload"
echo "===================================="
echo ""
echo "All code fixes are implemented! The issue is browser caching."
echo ""
echo "To see the fixes, follow these steps:"
echo ""
echo "1. Open Chrome and go to: chrome://extensions"
echo "2. Find 'ZK Vault' extension"
echo "3. Click the 'Remove' button"
echo "4. Close ALL Chrome windows completely (Cmd+Q on Mac)"
echo "5. Wait 5 seconds"
echo "6. Reopen Chrome"
echo "7. Go to: chrome://extensions"
echo "8. Enable 'Developer mode' (toggle in top-right)"
echo "9. Click 'Load unpacked'"
echo "10. Select this folder: $(pwd)"
echo ""
echo "This will force a complete reload without cached files."
echo ""
echo "✅ What you'll see after reload:"
echo "   - High-quality PNG image (1080x1440)"
echo "   - No scrollbar"
echo "   - Back button in top-left"
echo "   - Full buttons (Share + Download)"
echo "   - Full-page view (not modal)"
echo ""

# Update file timestamps to help with reload
touch popup/popup.html
touch popup/popup.js
touch popup/popup.css
touch background/service-worker.js
touch manifest.json

echo "📝 File timestamps updated: $(date)"
echo ""
echo "Ready to reload! Follow the steps above."
