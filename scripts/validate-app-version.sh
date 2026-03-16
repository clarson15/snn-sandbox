#!/bin/bash
# APP_VERSION validation script
# Validates that APP_VERSION follows the expected semver + build metadata format

set -e

# Get APP_VERSION from environment or first argument
APP_VERSION="${1:-${APP_VERSION}}"

if [ -z "$APP_VERSION" ]; then
    echo "ERROR: APP_VERSION not provided"
    echo "Usage: $0 <APP_VERSION> or APP_VERSION=<version> $0"
    exit 1
fi

echo "Validating APP_VERSION: $APP_VERSION"

# Validation patterns
# Main build: either 0.0.1+build.<timestamp> (no tags case) or <major>.<minor>.<patch+1>+build.<timestamp>
MAIN_BUILD_PATTERN="^(0\.0\.1|[1-9][0-9]*\.[0-9]+\.[0-9]+)\+build\.[0-9]{8}T[0-9]{6}Z$"

# PR build: 0.0.0-pr.<pr-number>+sha.<shortsha>+build.<timestamp>
PR_BUILD_PATTERN="^0\.0\.0-pr\.[0-9]+\+sha\.[0-9a-f]{7}\+build\.[0-9]{8}T[0-9]{6}Z$"

# Local build (default)
LOCAL_PATTERN="^0\.0\.0-local$"

# Override pattern (user-specified) - basic semver
OVERRIDE_PATTERN="^[0-9]+\.[0-9]+\.[0-9]+$"

if [[ "$APP_VERSION" =~ $MAIN_BUILD_PATTERN ]]; then
    echo "✓ Valid main-build APP_VERSION format"
    exit 0
elif [[ "$APP_VERSION" =~ $PR_BUILD_PATTERN ]]; then
    echo "✓ Valid pr-build APP_VERSION format"
    exit 0
elif [[ "$APP_VERSION" =~ $LOCAL_PATTERN ]]; then
    echo "✓ Valid local-build APP_VERSION format"
    exit 0
elif [[ "$APP_VERSION" =~ $OVERRIDE_PATTERN ]]; then
    echo "✓ Valid user-override APP_VERSION format"
    exit 0
else
    echo "ERROR: APP_VERSION '$APP_VERSION' does not match expected format"
    echo ""
    echo "Expected formats:"
    echo "  Main build: <major>.<minor>.<patch+1>+build.YYYYMMDDTHHMMSSZ"
    echo "              or 0.0.1+build.YYYYMMDDTHHMMSSZ (no tags)"
    echo "  PR build:   0.0.0-pr.<pr>+sha.<sha>+build.YYYYMMDDTHHMMSSZ"
    echo "  Local:      0.0.0-local"
    echo "  Override:   <semver>"
    exit 1
fi
