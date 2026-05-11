# ClarityMDT WhatsApp Templates Guide

## Approved Template (Generic — Used for All Notifications)

The hospital IT department has obtained approval for a **single generic template** that is used for **both** Authentication (OTP / 2FA) and Utility (system notifications) purposes.

### Approved Template Body

```text

Dear Doctor, 
Greetings from MDT System Alert
*{{1}}*
{{2}}
Thanks,

Hospital Name
```

### Variables

| Variable | Purpose | Example Value |
|----------|---------|---------------|
| `{{1}}` | **Title** (rendered bold) | `Login Verification`, `New Case Submitted` |
| `{{2}}` | **Message body** | `Your verification code is: 482910...`, `A new case has been submitted for Patient XYZ.` |

> **Note:** The hospital name ("Sri Narayani Hospital") and greeting are hardcoded in the approved template body. They are NOT dynamic variables.

---

## How the App Uses This Template

### 1. Authentication (OTP / 2FA)

When a user needs to verify their WhatsApp number or log in with 2FA, the template is populated as:

```text

Dear Doctor, 
Greetings from MDT System Alert
*Login Verification*
Your verification code is: 482910

This code will expire in 5 minutes. Do not share this code with anyone.
Thanks,

```

- `{{1}}` = `Login Verification` or `WhatsApp Verification`
- `{{2}}` = OTP code + expiry warning

### 2. System Notifications (Utility)

For all system events (case submissions, meeting updates, etc.), the template is populated dynamically:

```text

Dear Doctor, 
Greetings from MDT System Alert
*New Case Submitted*
A new case has been submitted for Patient John Doe. Please log in to the ClarityMDT portal to review.
Thanks,

```

- `{{1}}` = Notification title (e.g., "New Case Submitted", "Meeting Scheduled")
- `{{2}}` = Notification message body

### Supported Notification Types

All of the following system events use the same approved template:

| Notification Type | Example `{{1}}` Title | Example `{{2}}` Message |
|---|---|---|
| `MEETING_CREATED` | Meeting Scheduled | A new MDT meeting has been scheduled for 15-May-2026. |
| `MEETING_UPDATED` | Meeting Updated | The MDT meeting on 15-May-2026 has been updated. |
| `MEETING_CANCELLED` | Meeting Cancelled | The MDT meeting on 15-May-2026 has been cancelled. |
| `CASE_SUBMITTED` | New Case Submitted | A new case has been submitted for Patient XYZ. |
| `CASE_RESUBMITTED` | Case Resubmitted | Case for Patient XYZ has been resubmitted. |
| `CASE_POSTPONED` | Case Postponed | Case for Patient XYZ has been postponed. |
| `MDT_REVIEW_COMPLETED` | MDT Review Completed | The MDT review for Patient XYZ has been completed. |
| `MEETING_REQUEST` | Meeting Requested | A new MDT meeting has been requested. |
| `MANUAL_NOTIFICATION` | *(Admin-defined)* | *(Admin-defined message)* |

---

## Registration Steps (Zestwings Provider)

Since the hospital uses the **Zestwings aggregator**, the template is managed externally in Meta Business Manager. To register it in ClarityMDT:

1. Navigate to **Admin Settings → WhatsApp Settings → Templates**.
2. Click **"Register Template"**.
3. Fill in the details:
   - **Template Name**: Enter the exact approved template name as registered in Meta (e.g., `mdt_system_alert`)
   - **Category**: `UTILITY`
   - **Language**: `en_US`
   - **Body Text**: Paste the approved template body (with `{{1}}` and `{{2}}` placeholders)
   - **Notification Type**: Leave as **"Generic (All Types)"** — do NOT assign a specific type
4. Click **Register** — it will be saved as `APPROVED` automatically.

> **Important:** Since this is a generic template, leave the **Notification Type** dropdown unset (null). The app will automatically fall back to this template for all notification types and authentication.

---

## Template Lookup Logic

The app follows this priority order when sending a message:

### For System Notifications:
1. Look for an approved template matching the **exact notification type** (e.g., `CASE_SUBMITTED`)
2. If none found → use any approved **generic template** (notification type = null)

### For Authentication (OTP / 2FA):
1. Look for an approved template with **category = "AUTHENTICATION"**
2. If none found → use any approved **generic template** (notification type = null)

This design means you only need **one registered template** for everything to work. If the hospital later gets type-specific templates approved, they can be registered alongside and will take priority.
