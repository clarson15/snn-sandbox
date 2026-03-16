#!/bin/bash
# Test script for validate-app-version.sh
# Validates that the validator correctly handles all expected formats

set -e

SCRIPT_DIR="$(dirname "$0")"
VALIDATOR="$SCRIPT_DIR/validate-app-version.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

run_test() {
    local description="$1"
    local version="$2"
    local should_pass="$3"
    
    if [ "$should_pass" = "pass" ]; then
        if "$VALIDATOR" "$version" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} PASS: $description"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗${NC} FAIL: $description (expected to pass)"
            FAILED=$((FAILED + 1))
        fi
    else
        if ! "$VALIDATOR" "$version" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} PASS: $description"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗${NC} FAIL: $description (expected to fail)"
            FAILED=$((FAILED + 1))
        fi
    fi
}

echo "=== APP_VERSION Validator Tests ==="
echo ""

# Main build tests (0.x series)
run_test "0.0.1+build.20260316T120334Z (no-tag main build)" "0.0.1+build.20260316T120334Z" "pass"
run_test "0.0.62+build.20260316T120334Z (0.x series)" "0.0.62+build.20260316T120334Z" "pass"
run_test "0.0.100+build.20260316T120334Z (0.x series large patch)" "0.0.100+build.20260316T120334Z" "pass"
run_test "0.0.0+build.20260316T120334Z (should reject 0.0.0)" "0.0.0+build.20260316T120334Z" "fail"

# Main build tests (1.x+ series)
run_test "1.0.0+build.20260316T120334Z (major version)" "1.0.0+build.20260316T120334Z" "pass"
run_test "1.2.3+build.20260316T120334Z (semver)" "1.2.3+build.20260316T120334Z" "pass"
run_test "10.20.30+build.20260316T120334Z (multi-digit)" "10.20.30+build.20260316T120334Z" "pass"

# PR build tests
run_test "0.0.0-pr.226+sha.abcdef1+build.20260316T120334Z (PR build)" "0.0.0-pr.226+sha.abcdef1+build.20260316T120334Z" "pass"

# Local build tests
run_test "0.0.0-local (local build)" "0.0.0-local" "pass"

# Override/user-specified tests
run_test "1.2.3 (semver override)" "1.2.3" "pass"
run_test "0.1.0 (semver override)" "0.1.0" "pass"

# Invalid formats
run_test "invalid-version (invalid)" "invalid-version" "fail"
run_test "0.0.1+build (incomplete timestamp)" "0.0.1+build.20260316" "fail"
run_test "0.0.1+build.20260316T120334 (missing Z)" "0.0.1+build.20260316T120334" "fail"
run_test "v0.0.1+build.20260316T120334Z (v prefix - invalid)" "v0.0.1+build.20260316T120334Z" "fail"

echo ""
echo "=== Summary ==="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
