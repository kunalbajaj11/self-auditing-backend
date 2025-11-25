#!/usr/bin/env node

/**
 * Configuration Verification Script
 * Checks if all required environment variables are set
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const checks = {
  passed: [],
  failed: [],
  warnings: [],
};

// Check AWS S3 Configuration
console.log('\n🔍 Checking AWS S3 Configuration...');
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  checks.passed.push('AWS_ACCESS_KEY_ID is set');
  checks.passed.push('AWS_SECRET_ACCESS_KEY is set');
  if (process.env.AWS_S3_BUCKET) {
    checks.passed.push(`AWS_S3_BUCKET is set: ${process.env.AWS_S3_BUCKET}`);
  } else {
    checks.warnings.push('AWS_S3_BUCKET not set (will use default: smart-expense-uae)');
  }
  if (process.env.AWS_S3_REGION) {
    checks.passed.push(`AWS_S3_REGION is set: ${process.env.AWS_S3_REGION}`);
  } else {
    checks.warnings.push('AWS_S3_REGION not set (will use default: me-south-1)');
  }
} else {
  checks.failed.push('AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY is missing');
}

// Check SMTP Configuration
console.log('\n🔍 Checking SMTP/Email Configuration...');
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
  checks.passed.push(`SMTP_HOST is set: ${process.env.SMTP_HOST}`);
  checks.passed.push(`SMTP_USER is set: ${process.env.SMTP_USER}`);
  checks.passed.push('SMTP_PASSWORD is set');
  if (process.env.SMTP_PORT) {
    checks.passed.push(`SMTP_PORT is set: ${process.env.SMTP_PORT}`);
  } else {
    checks.warnings.push('SMTP_PORT not set (will use default: 587)');
  }
  if (process.env.SMTP_FROM) {
    checks.passed.push(`SMTP_FROM is set: ${process.env.SMTP_FROM}`);
  } else {
    checks.warnings.push('SMTP_FROM not set (will use default: noreply@smartexpense-uae.com)');
  }
} else {
  checks.failed.push('SMTP_HOST, SMTP_USER, or SMTP_PASSWORD is missing');
}

// Check Google Vision OCR Configuration
console.log('\n🔍 Checking Google Vision OCR Configuration...');
if (process.env.OCR_PROVIDER === 'google') {
  checks.passed.push('OCR_PROVIDER is set to: google');
  
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
    path.join(process.cwd(), 'google-credentials.json');
  
  if (fs.existsSync(credentialsPath)) {
    checks.passed.push(`Google credentials file exists: ${credentialsPath}`);
    try {
      const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      if (creds.type === 'service_account' && creds.project_id) {
        checks.passed.push(`Service account project: ${creds.project_id}`);
        checks.passed.push(`Service account email: ${creds.client_email}`);
      } else {
        checks.failed.push('Google credentials file is not a valid service account JSON');
      }
    } catch (error) {
      checks.failed.push(`Google credentials file is not valid JSON: ${error.message}`);
    }
  } else {
    checks.failed.push(`Google credentials file not found: ${credentialsPath}`);
  }
} else if (process.env.OCR_PROVIDER === 'mock') {
  checks.warnings.push('OCR_PROVIDER is set to: mock (using mock OCR, not Google Vision)');
} else {
  checks.warnings.push('OCR_PROVIDER not set (will use default: mock)');
}

// Check Database Configuration
console.log('\n🔍 Checking Database Configuration...');
if (process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_PASSWORD && process.env.DB_NAME) {
  checks.passed.push('Database configuration is set');
} else {
  checks.failed.push('Database configuration is incomplete');
}

// Check JWT Configuration
console.log('\n🔍 Checking JWT Configuration...');
if (process.env.JWT_ACCESS_SECRET && process.env.JWT_REFRESH_SECRET) {
  checks.passed.push('JWT secrets are set');
} else {
  checks.failed.push('JWT secrets are missing');
}

// Print Summary
console.log('\n' + '='.repeat(60));
console.log('📊 CONFIGURATION VERIFICATION SUMMARY');
console.log('='.repeat(60));

if (checks.passed.length > 0) {
  console.log('\n✅ PASSED (' + checks.passed.length + '):');
  checks.passed.forEach(check => console.log('   ✓ ' + check));
}

if (checks.warnings.length > 0) {
  console.log('\n⚠️  WARNINGS (' + checks.warnings.length + '):');
  checks.warnings.forEach(warning => console.log('   ⚠ ' + warning));
}

if (checks.failed.length > 0) {
  console.log('\n❌ FAILED (' + checks.failed.length + '):');
  checks.failed.forEach(fail => console.log('   ✗ ' + fail));
}

console.log('\n' + '='.repeat(60));

const totalChecks = checks.passed.length + checks.warnings.length + checks.failed.length;
const successRate = ((checks.passed.length / totalChecks) * 100).toFixed(1);

if (checks.failed.length === 0) {
  console.log('✅ All critical configurations are set!');
  if (checks.warnings.length > 0) {
    console.log('⚠️  Some optional configurations are missing (using defaults)');
  }
  process.exit(0);
} else {
  console.log('❌ Some critical configurations are missing!');
  process.exit(1);
}

