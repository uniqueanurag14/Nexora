# Nexora — User Manual

Welcome to **Nexora**, a secure, modular web application platform built on enterprise standards. This manual provides clear instructions for administrators and end users operating Nexora's foundation and authentication features.

---

## 1. Nexora Overview and Current Module Scope

Nexora is designed with a durable, decoupled architecture that currently provides two core modules:

- **Module 1: Foundation & Configuration**
  - Centralized, validated environment configuration.
  - Relational PostgreSQL data persistence.
  - Standardized API communication and diagnostic health probes.
  - High-availability frontend user interface.
- **Module 2: Authentication & Account Security**
  - Cryptographically signed JWT session management.
  - Bcrypt password hashing.
  - Immediate server-side session revocation on logout and password change.
  - Single-use, time-limited password recovery tokens.
  - User profile management and administrative account directories.

*Note: Future business modules (such as workforce event management and supplier integration) are planned for subsequent phases and will plug directly into this foundation without requiring redesign.*

---

## 2. System Requirements and Supported Browsers

Nexora is a web-based platform accessible from desktop computers, laptops, tablets, and smartphones.

### Supported Browsers
- **Google Chrome** (version 100 or newer)
- **Mozilla Firefox** (version 100 or newer)
- **Apple Safari** (version 15 or newer)
- **Microsoft Edge** (version 100 or newer)
- Modern mobile browsers (iOS Safari, Android Chrome)

### Hardware Recommendations
- Any modern PC, Mac, or mobile device with internet connectivity.
- Minimum display resolution: 375px width (smartphones) up to 4K desktop screens.

---

## 3. Application Startup and Access URLs

Once started, Nexora is accessible through your web browser:

- **Primary Application URL**: `http://localhost:3000` (or your configured production domain)
- **System Health Diagnostics**: `http://localhost:3000?view=status`
- **Sign In Screen**: `http://localhost:3000?view=login`

If your system administrator has configured a custom domain or HTTPS port (such as `https://localhost:3001`), use the URL provided by your administrator.

---

## 4. Initial Super Admin Setup

During initial platform deployment, the system administrator configures the Super Admin credentials in the secure environment file (`.env`):

```dotenv
SUPER_ADMIN_NAME=System Administrator
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD=YourSecurePassword123!
SUPER_ADMIN_ENABLED=true
```

To initialize the database and provision this administrator account, execute:

```bash
npm run db:init
```

- If the account does not yet exist, it is created with full `super_admin` privileges and its password is encrypted using bcrypt.
- If the account already exists, its stored password and settings are preserved without alteration.

---

## 5. Login and Logout

### Logging In
1. Navigate to the application URL in your browser.
2. Enter your registered email address (e.g., `admin@example.com`).
3. Enter your account password. You can click the eye icon to verify what you typed.
4. Click **Sign In**.
5. Upon successful verification against the PostgreSQL database, you will be redirected to the Dashboard.

### Logging Out
1. In the top navigation bar, click the **Logout** button (located in the top-right corner).
2. The server immediately registers your session token in the revocation blocklist and removes your secure authentication cookies.
3. You will be returned to the Sign In screen with a confirmation notification.

---

## 6. Profile Management

1. Click **Profile** in the top navigation bar.
2. Review your account details:
   - **Full Name**: Your display name.
   - **Email Address**: Bound to your PostgreSQL identity.
   - **Privilege Level**: Displays your role (`super_admin`, `admin`, or `user`).
   - **Session History**: Shows your last login timestamp and registration date.
3. To update your name:
   - Click **Edit** next to your Full Name.
   - Enter your updated name and click **Save Changes**.
   - Your updated name is saved immediately in the database.

*Security Notice: Users cannot elevate their own role or privileges through the profile screen. Role changes require administrator governance.*

---

## 7. Password Changes

1. Open your **Profile** page.
2. Click the **Change Password** button.
3. Fill out the dialog form:
   - **Current Password**: Enter your existing password to verify ownership.
   - **New Password**: Enter a new strong password (minimum 8 characters, with uppercase, lowercase, numbers, and symbols).
   - **Confirm New Password**: Re-enter the new password.
4. Click **Update Password**.
5. The system verifies your current password, checks complexity, updates your encrypted password in PostgreSQL, and invalidates all other active sessions for security.

---

## 8. Forgot Password and Reset Password Workflow

If you forget your password:

### Requesting Recovery
1. On the Sign In screen, click **Forgot password?**.
2. Enter your registered email address and click **Send Recovery Link**.
3. For security and privacy, Nexora always displays a standard confirmation message regardless of whether the email address is registered, preventing unauthorized account enumeration.
4. If the email is registered and SMTP is configured, an email containing a secure single-use link is delivered to your inbox.

### Using the Reset Link
1. Click the link in your email (or navigate to `http://localhost:3000/reset-password?token=YOUR_TOKEN`).
2. Enter your new password and confirm it.
3. Click **Reset Password & Invalidate Sessions**.
4. The link is marked as used, any prior sessions are terminated, and you can now log in with your new credentials.

---

## 9. Common Errors and Troubleshooting

| Message / Symptom | Possible Cause | Solution |
| :--- | :--- | :--- |
| **"Invalid email or password"** | Incorrect email or password entered. | Verify spelling. Remember passwords are case-sensitive. Use "Forgot password" if needed. |
| **"Account has been suspended"** | Administrator marked account inactive. | Contact your Super Admin to reactivate your account. |
| **"This password reset link has expired"** | Link was not used within 60 minutes. | Request a new password reset link. |
| **"This reset link has already been used"** | Single-use token was previously consumed. | Reset tokens are single-use only. Request a new link if you still need to change credentials. |
| **"Passwords do not match"** | New password and confirmation differ. | Carefully retype the new password in both fields. |

---

## 10. What to Do When PostgreSQL is Unavailable

If the database is down or unreachable:
1. The Sign In screen and API will display: `"Authentication service is currently unavailable. Please verify PostgreSQL status."`
2. Open the **System Health** page (`/status`).
3. Under `[1/3] PostgreSQL Database`, you will see `UNAVAILABLE`.
4. Solution:
   - Ensure the PostgreSQL database daemon is running.
   - Verify `DATABASE_URL` in your `.env` file.
   - Run `npm run db:init` to verify database connectivity.

---

## 11. What to Do When Email Service is Unavailable

If the SMTP server is unconfigured or unavailable:
1. Nexora continues to operate for login, profile editing, and user directory management.
2. In **System Health**, `[3/3] SMTP Server` will show `NOT CONFIGURED` or `UNAVAILABLE`.
3. Password recovery links will not be delivered via email. Administrators can inspect the server logs for generated recovery audit events or configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD` in `.env`.

---

## 12. Security Recommendations & Best Practices

- **Use Unique Passwords**: Never reuse passwords across external platforms.
- **Log Out on Shared Devices**: Always click **Logout** when finishing a session on public or shared computers.
- **Protect Reset Tokens**: Treat reset links like temporary passwords—never forward or share them.
- **Review System Status Regularly**: Check the **System Health** page to ensure your database connection remains active and green.

---

## 13. Recognizing Unavailable Feature Dependencies

Nexora indicates service availability through clear visual badges:
- **Green "CONNECTED" or "READY"**: The service is healthy and active.
- **Amber "NOT CONFIGURED"**: The service is optional and currently disabled; email notifications will be skipped.
- **Red "UNAVAILABLE"**: A core dependency is down; affected operations will pause gracefully without data corruption.

---

## 14. Implemented vs. Planned Future Modules

### Implemented Now
- Full PostgreSQL persistence and migrations.
- Complete authentication (login, logout, session revocation).
- User profile viewing and updating.
- Password reset and password changes.
- Administrative user accounts directory.
- Live system diagnostics and health probes.

### Planned for Future Modules
- Workforce event management & shifts.
- Supplier portal & automated link management.
- Push notifications & scheduled background batch tasks.
