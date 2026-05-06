# ClarityMDT WhatsApp Templates Guide

To ensure proper WhatsApp notifications in your application, you must submit the following templates for approval in your Meta WhatsApp Business Manager. 

Based on your request, **all templates now include the Hospital Name dynamically fetched from the database settings**.

## 1. Authentication Template (For OTPs & 2FA)
This template is required for sending One-Time Passwords.

* **Category:** Authentication
* **Name:** `clarity_mdt_auth` *(Must be lowercase with underscores)*
* **Language:** English (US) / `en_US`
* **Body:**
  ```text
  *ClarityMDT Login Verification*

  Your verification code is: *{{1}}*

  This code will expire in 5 minutes. Do not share this code with anyone.

  -- ClarityMDT - {{2}}
  ```
* **Variables:**
  * `{{1}}`: Type = "One-Time Password / Code"
  * `{{2}}`: Type = "Text" (This will automatically map to the HospitalName)

---

## 2. Utility Templates (For System Notifications)
You can choose to either submit a **single generic template** (Option A) that handles all notification types dynamically, or submit **dedicated templates** for each notification type (Option B). 

### Option A: Generic Notification Template (Recommended)
This approach maps all system notifications to a single WhatsApp template, minimizing the risk of Meta rejecting future templates and keeping management simple.

* **Category:** Utility
* **Name:** `mdt_system_alert`
* **Language:** English (US) / `en_US`
* **Body:**
  ```text
  *{{1}}*

  {{2}}

  -- ClarityMDT - {{3}}
  ```
* **Variables:**
  * `{{1}}`: Notification Title (e.g., "New Case Submitted")
  * `{{2}}`: Notification Message (e.g., "A new case has been submitted for Patient XYZ.")
  * `{{3}}`: Hospital Name

### Option B: Dedicated Templates
If you prefer specific templates for each system event, you must create one for each `NotificationType`. The structure remains identical for all of them; only the Template Name changes.

**Required Names (Must map exactly in the Admin Portal later):**
1. `meeting_created`
2. `meeting_updated`
3. `meeting_cancelled`
4. `case_submitted`
5. `case_resubmitted`
6. `case_postponed`
7. `mdt_review_completed`
8. `meeting_request`
9. `manual_notification`

**Structure for each dedicated template (Example: `case_submitted`):**
* **Category:** Utility
* **Name:** `case_submitted` *(or any of the names above)*
* **Language:** English (US) / `en_US`
* **Body:**
  ```text
  *Case Update: {{1}}*

  {{2}}

  Please log in to the ClarityMDT portal to view more details.

  -- ClarityMDT - {{3}}
  ```
* **Variables:**
  * `{{1}}`: Specific Notification Title
  * `{{2}}`: Specific Notification Message
  * `{{3}}`: Hospital Name

---
### Next Steps
1. Submit these templates in the **Meta WhatsApp Business Manager**.
2. Once approved by Meta, navigate to your app's **Admin Settings > WhatsApp Settings**.
3. Click the **"Sync Templates"** button to load them into your database.
4. Finally, map the templates to their corresponding events using the dropdowns in the interface.
