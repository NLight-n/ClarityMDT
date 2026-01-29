# HIPAA Compliance Guide

This document outlines the HIPAA compliance features implemented in the MDT Register Digital System.

## Overview

The following HIPAA Security Rule requirements have been addressed:

| Requirement | HIPAA Section | Status |
|------------|---------------|--------|
| Automatic Logoff | §164.312(a)(2)(iii) | ✅ Implemented |
| Encryption in Transit | §164.312(e)(1) | ✅ Implemented |
| Encryption at Rest | §164.312(a)(2)(iv) | ✅ Implemented |
| Authentication Controls | §164.312(d) | ✅ Implemented |
| Two-Factor Authentication | §164.312(d) | ✅ Implemented (Optional) |
| Audit Controls | §164.312(b) | ✅ Implemented |

---

## 1. Automatic Session Timeout

**HIPAA Reference:** §164.312(a)(2)(iii) - Automatic Logoff

### Configuration

```env
# Session duration in minutes (default: 15)
SESSION_MAX_AGE_MINUTES=15
```

### How It Works

- User sessions expire after 15 minutes of inactivity (configurable)
- Sessions are automatically extended when the user is active
- Upon timeout, users are redirected to the login page
- Session cookies are cleared on timeout

### Recommendations

- Use 15 minutes or less for healthcare environments
- Consider shorter timeouts for high-security areas

---

## 2. HTTPS Enforcement (Encryption in Transit)

**HIPAA Reference:** §164.312(e)(1) - Encryption in Transit

### Configuration

```env
# Enable HTTPS enforcement (set to "true" in production)
ENFORCE_HTTPS=false
```

### How It Works

- When enabled, all HTTP requests are redirected to HTTPS (301 redirect)
- HSTS (HTTP Strict Transport Security) headers are added for HTTPS connections
- Works with both direct HTTPS and reverse proxies (Cloudflare Tunnel, nginx, etc.)

### Security Headers Added

The following security headers are automatically added:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HSTS enforcement |
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking protection |
| `X-Content-Type-Options` | `nosniff` | MIME type sniffing prevention |
| `X-XSS-Protection` | `1; mode=block` | XSS filter (legacy browsers) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Referrer control |
| `Content-Security-Policy` | Various | XSS and injection protection |

### Deployment Notes

- For LAN-only deployments (HTTP), leave `ENFORCE_HTTPS=false`
- For production with Cloudflare Tunnel or similar, set `ENFORCE_HTTPS=true`
- The system automatically detects protocol from `x-forwarded-proto` header

---

## 3. PHI Encryption at Rest

**HIPAA Reference:** §164.312(a)(2)(iv) - Encryption and Decryption

### Configuration

```env
# Enable PHI encryption (set to "true" after migration)
ENABLE_PHI_ENCRYPTION=false

# Optional: separate encryption key for PHI
# If not set, NEXTAUTH_SECRET is used
PHI_ENCRYPTION_KEY=your-secure-key-here
```

### Protected Fields

The following patient data fields are encrypted when enabled:

- `patientName` - Patient's full name
- `mrn` - Medical Record Number

### Encryption Algorithm

- **Algorithm:** AES-256-GCM
- **Key Derivation:** SHA-256 hash of the encryption key
- **IV:** Random 16-byte initialization vector per encryption
- **Authentication:** GCM authentication tag for integrity

### Migration Process

**Before enabling encryption on existing data:**

1. Set `ENABLE_PHI_ENCRYPTION=true` in your `.env` file
2. Set `PHI_ENCRYPTION_KEY` (or ensure `NEXTAUTH_SECRET` is set)
3. Run the migration script:

```bash
npm run migrate:phi
```

4. Verify the migration was successful
5. Restart your application

### Backward Compatibility

- The system gracefully handles both encrypted and plaintext data
- Existing plaintext data remains readable until migrated
- New data is encrypted based on the `ENABLE_PHI_ENCRYPTION` setting

---

## 4. Rate Limiting (Authentication Controls)

**HIPAA Reference:** §164.312(d) - Person or Entity Authentication

### How It Works

- Failed login attempts are tracked per user (by login ID)
- After 5 failed attempts within 15 minutes, account is temporarily locked
- Lockout duration: 30 minutes
- Successful login resets the counter

### Configuration (Code-level)

```typescript
// lib/security/rateLimit.ts
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,    // 15 minutes window
  maxAttempts: 5,              // 5 attempts allowed
  lockoutMs: 30 * 60 * 1000,   // 30 minute lockout
};
```

### User Experience

- Users see a clear error message when locked out
- The message includes the remaining lockout time
- Lockout is per-user, not per-IP (protects against account targeting)

---

## 5. Two-Factor Authentication (2FA)

**HIPAA Reference:** §164.312(d) - Person or Entity Authentication

### Overview

Optional two-factor authentication via Telegram for enhanced security. Users must have their Telegram account linked to enable 2FA.

### How It Works

1. User enters login credentials
2. If 2FA is enabled, a 6-digit code is sent to their linked Telegram account
3. User enters the code to complete login
4. Code expires after 5 minutes

### Enabling 2FA

Users can enable 2FA in **Settings → User Profile**:

1. First, link a Telegram account (required)
2. Toggle "Two-Factor Authentication" switch to ON
3. On next login, a verification code will be required

### Features

- **Per-user setting:** Each user can choose whether to enable 2FA
- **Rate limited:** Code requests are rate-limited to prevent abuse
- **Secure codes:** 6-digit numeric codes, expire after 5 minutes
- **Resend option:** Users can request a new code if needed
- **Audit logged:** 2FA login events are recorded in audit logs

### User Experience

1. User enters login ID and password
2. If credentials valid and 2FA enabled, redirected to code entry screen
3. Code arrives on Telegram within seconds
4. User enters code and is logged in

---

## 6. Audit Logging

**HIPAA Reference:** §164.312(b) - Audit Controls

### Events Logged

| Event | Description |
|-------|-------------|
| LOGIN | User authentication |
| CASE_SUBMIT | Case submitted to MDT |
| CASE_UPDATE | Case information modified |
| CASE_DELETE | Case deleted |
| CONSENSUS_CREATE | Consensus report created |
| CONSENSUS_EDIT | Consensus report modified |
| COORDINATOR_ASSIGN | User promoted to coordinator |
| COORDINATOR_REVOKE | Coordinator role removed |
| USER_CREATE | New user created |
| USER_UPDATE | User information modified |
| USER_DELETE | User deleted |
| DEPARTMENT_CREATE | Department created |
| DEPARTMENT_UPDATE | Department modified |
| DEPARTMENT_DELETE | Department deleted |
| HOSPITAL_SETTINGS_UPDATE | Hospital settings changed |

### Log Fields

- User ID (who performed the action)
- Action type
- Target entity (case ID, user ID, etc.)
- Details (JSON)
- IP address (when available)
- Timestamp

---

## Environment Variables Summary

```env
# =============================================================================
# HIPAA COMPLIANCE CONFIGURATION
# =============================================================================

# Session Timeout (HIPAA §164.312(a)(2)(iii) - Automatic Logoff)
SESSION_MAX_AGE_MINUTES=15

# HTTPS Enforcement (HIPAA §164.312(e)(1) - Encryption in Transit)
ENFORCE_HTTPS=false

# PHI Encryption Key (HIPAA §164.312(a)(2)(iv) - Encryption at Rest)
# PHI_ENCRYPTION_KEY=your-phi-encryption-key-here

# Enable PHI Encryption at Rest
ENABLE_PHI_ENCRYPTION=false
```

---

## Production Deployment Checklist

- [ ] Set `ENFORCE_HTTPS=true`
- [ ] Set `SESSION_MAX_AGE_MINUTES=15` (or less)
- [ ] Generate strong `NEXTAUTH_SECRET` (32+ characters)
- [ ] Consider setting separate `PHI_ENCRYPTION_KEY`
- [ ] Enable and test PHI encryption (`ENABLE_PHI_ENCRYPTION=true`)
- [ ] Run PHI migration if existing data exists
- [ ] Verify audit logs are being captured
- [ ] Configure database SSL (`?sslmode=require` in DATABASE_URL)
- [ ] Enable MinIO SSL (`MINIO_SSL=true`)
- [ ] Review and test all security headers
- [ ] Document Business Associate Agreements (BAAs) with cloud providers

---

## Additional Recommendations

### Password Policy

Current minimum: 6 characters. Consider strengthening to:
- Minimum 12 characters
- Require uppercase, lowercase, numbers, and special characters

### Database Encryption

For full encryption at rest, consider:
- PostgreSQL Transparent Data Encryption (TDE)
- Encrypted storage volumes (AWS EBS, Azure managed disks)

### Backup Encryption

Ensure database and MinIO backups are encrypted:
- Use encrypted backup storage
- Encrypt backup files before upload

---

## Support

For questions about HIPAA compliance implementation, consult with:
- Your organization's Compliance Officer
- Healthcare IT security professionals
- Legal counsel familiar with HIPAA regulations
