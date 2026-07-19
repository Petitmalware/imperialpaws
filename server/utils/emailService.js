/* =====================================================
   ImperialPaws – Email Notification Service
   Handles automated notifications for:
   - Application Submission Confirmations
   - Application Status Updates (Approved, Processing, Declined)
   - Invoice Issued Notifications

   Designed for high inbox deliverability (Primary Inbox):
   - Multi-part MIME (Plain Text + Clean HTML)
   - Non-blocking async dispatch
   - Configurable enable/disable toggle
===================================================== */
const nodemailer = require("nodemailer");
const { loadSiteSettings } = require("./siteSettings");

// SMTP Configuration from Environment with sensible defaults for Spaceship / Spacemail
const SMTP_HOST = process.env.SMTP_HOST || "mail.spaceship.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465; // 465 (SSL/TLS) or 587 (STARTTLS)
const SMTP_SECURE = process.env.SMTP_SECURE !== "false"; // true for port 465
const SMTP_USER = process.env.SMTP_USER || "info@imperialpaws.pet";
const SMTP_PASS = process.env.SMTP_PASS || "Nearbykidd$16$";
const DEFAULT_FROM = process.env.SMTP_FROM || `"ImperialPaws Pekingese" <info@imperialpaws.pet>`;

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return transporter;
}

/**
 * Check if email notifications are enabled.
 */
async function isEmailEnabled() {
  if (process.env.ENABLE_EMAIL_NOTIFICATIONS === "false") return false;
  const settings = await loadSiteSettings();
  if (settings?.notifications?.enableEmail === false) return false;
  return Boolean(SMTP_USER && SMTP_PASS);
}

/**
 * Base email layout wrapper with elegant luxury styling.
 */
function wrapHtmlContent(title, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f2ee; color: #222222; margin: 0; padding: 20px; -webkit-font-smoothing: antialiased; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06); border: 1px solid #e8e4dc; }
    .email-header { background: linear-gradient(180deg, #1f1f1f 0%, #2a2a2a 100%); color: #ffffff; text-align: center; padding: 28px 20px; }
    .email-header h1 { font-family: Georgia, serif; margin: 0; font-size: 22px; font-weight: normal; letter-spacing: 1px; color: #c7a45a; }
    .email-header p { margin: 4px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #d4cfc3; }
    .email-body { padding: 32px 28px; line-height: 1.7; font-size: 15px; color: #333333; }
    .email-body h2 { font-family: Georgia, serif; color: #1f1f1f; font-size: 18px; margin-top: 0; }
    .code-box { background: #f9f8f4; border: 1.5px dashed #c7a45a; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0; }
    .code-box strong { font-size: 20px; letter-spacing: 2px; color: #7a5c1e; font-family: monospace; }
    .btn { display: inline-block; background: #c7a45a; color: #111111; text-decoration: none; font-weight: 600; padding: 12px 28px; border-radius: 999px; margin-top: 16px; text-align: center; }
    .email-footer { background: #f6f4ef; text-align: center; padding: 20px; font-size: 12px; color: #777777; border-top: 1px solid #eee; }
    .email-footer a { color: #7a5c1e; text-decoration: none; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>ImperialPaws</h1>
      <p>PEKINGESE BREEDER</p>
    </div>
    <div class="email-body">
      ${contentHtml}
    </div>
    <div class="email-footer">
      &copy; ${new Date().getFullYear()} ImperialPaws Pekingese. All rights reserved.<br>
      <a href="https://imperialpaws.net">imperialpaws.net</a> &bull; <a href="mailto:info@imperialpaws.pet">info@imperialpaws.pet</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send email safely without blocking code execution or throwing fatal errors.
 */
async function sendMailSafe({ to, subject, text, html }) {
  try {
    const enabled = await isEmailEnabled();
    if (!enabled) {
      console.log(`[Email Notice] Email disabled or SMTP unconfigured. Skipped sending "${subject}" to ${to}`);
      return false;
    }

    const mailOptions = {
      from: DEFAULT_FROM,
      to,
      subject,
      text, // Plain text alternative for high deliverability
      html,
      headers: {
        "X-Mailer": "ImperialPaws Application System",
        "X-Priority": "3"
      }
    };

    const info = await getTransporter().sendMail(mailOptions);
    console.log(`[Email Sent] "${subject}" to ${to} (MessageId: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`[Email Error] Failed to send "${subject}" to ${to}:`, err.message);
    return false;
  }
}

/**
 * Trigger: New Application Submitted Confirmation
 */
async function sendApplicationConfirmationEmail(application, baseUrl = "https://imperialpaws.net") {
  if (!application || !application.email) return;

  const trackUrl = `${baseUrl}/track?code=${encodeURIComponent(application.trackingCode || application.id)}`;
  const subject = `Application Received: ${application.name} – ImperialPaws Pekingese`;

  const text = `Hello ${application.name},\n\nThank you for submitting your adoption application to ImperialPaws Pekingese.\n\nYour Application Tracking Code is: ${application.trackingCode || application.id}\n\nYou can track the status of your application anytime at:\n${trackUrl}\n\nWe review each application carefully and will reach out to you shortly.\n\nWarm regards,\nImperialPaws Pekingese`;

  const html = wrapHtmlContent(
    "Application Received",
    `<h2>Thank you for your application, ${application.name}!</h2>
    <p>We have successfully received your adoption application for a Pekingese puppy. Our breeding team reviews every applicant carefully to ensure our puppies are placed in loving, lifelong homes.</p>
    <p>Your unique application tracking code is:</p>
    <div class="code-box">
      <strong>${application.trackingCode || application.id}</strong>
    </div>
    <p>You can check the status of your application anytime on our website:</p>
    <p style="text-align:center;">
      <a href="${trackUrl}" class="btn">Track Your Application</a>
    </p>
    <p>If you have any questions in the meantime, feel free to reply directly to this email.</p>
    <p>Warmest regards,<br><strong>ImperialPaws Pekingese</strong></p>`
  );

  return sendMailSafe({ to: application.email, subject, text, html });
}

/**
 * Trigger: Breeder Notification on New Application
 */
async function sendBreederNewApplicationAlert(application) {
  const subject = `🐾 New Adoption Application: ${application.name}`;
  const text = `New application received!\nName: ${application.name}\nEmail: ${application.email}\nPhone: ${application.phone || 'N/A'}\nTracking Code: ${application.trackingCode || application.id}`;
  const html = wrapHtmlContent(
    "New Application Received",
    `<h2>New Adoption Application Submitted</h2>
    <p><strong>Applicant Name:</strong> ${application.name}</p>
    <p><strong>Email:</strong> ${application.email}</p>
    <p><strong>Phone:</strong> ${application.phone || 'N/A'}</p>
    <p><strong>Tracking Code:</strong> <code>${application.trackingCode || application.id}</code></p>
    <p><a href="https://imperialpaws.net/admin/applications" class="btn">View in Admin Panel</a></p>`
  );

  return sendMailSafe({ to: "info@imperialpaws.pet", subject, text, html });
}

/**
 * Trigger: Application Status Updated (Approved, Processing, Declined)
 */
async function sendApplicationStatusUpdateEmail(application, newStatus, baseUrl = "https://imperialpaws.net") {
  if (!application || !application.email) return;

  const trackUrl = `${baseUrl}/track?code=${encodeURIComponent(application.trackingCode || application.id)}`;
  const statusFormatted = String(newStatus).toUpperCase();
  const subject = `Application Status Update: ${statusFormatted} – ImperialPaws Pekingese`;

  let statusMessage = "";
  if (newStatus.toLowerCase() === "approved") {
    statusMessage = `<p style="color: #166534; font-weight: bold;">Great news! Your adoption application has been APPROVED.</p><p>Our team will contact you directly to discuss puppy selection, final arrangements, and adoption details.</p>`;
  } else if (newStatus.toLowerCase() === "declined" || newStatus.toLowerCase() === "rejected") {
    statusMessage = `<p>Thank you for your interest in ImperialPaws Pekingese. At this time, we are unable to approve your application for current litters.</p>`;
  } else {
    statusMessage = `<p>Your adoption application status has been updated to: <strong>${newStatus}</strong>.</p>`;
  }

  const text = `Hello ${application.name},\n\nYour adoption application status has been updated to: ${statusFormatted}.\n\nTrack your application at:\n${trackUrl}\n\nImperialPaws Pekingese`;

  const html = wrapHtmlContent(
    `Status Update: ${statusFormatted}`,
    `<h2>Application Status Update</h2>
    <p>Dear ${application.name},</p>
    ${statusMessage}
    <p>Application Reference: <strong>${application.trackingCode || application.id}</strong></p>
    <p style="text-align:center;">
      <a href="${trackUrl}" class="btn">View Application Status</a>
    </p>
    <p>Thank you for choosing ImperialPaws Pekingese.</p>`
  );

  return sendMailSafe({ to: application.email, subject, text, html });
}

/**
 * Trigger: Invoice Issued Notification
 */
async function sendInvoiceNotificationEmail(invoice, applicationEmail, baseUrl = "https://imperialpaws.net") {
  if (!applicationEmail) return;

  const invoiceUrl = invoice.applicationId
    ? `${baseUrl}/invoice/${encodeURIComponent(invoice.applicationId)}/${encodeURIComponent(invoice.invoiceNumber)}`
    : `${baseUrl}/invoice/${encodeURIComponent(invoice.invoiceNumber)}`;

  const subject = `Adoption Invoice Issued #${invoice.invoiceNumber} – ImperialPaws Pekingese`;

  const text = `Hello ${invoice.adoptingParent?.name || 'there'},\n\nYour ImperialPaws adoption invoice (#${invoice.invoiceNumber}) is ready for review.\n\nView Invoice:\n${invoiceUrl}\n\nThank you,\nImperialPaws Pekingese`;

  const html = wrapHtmlContent(
    `Invoice #${invoice.invoiceNumber}`,
    `<h2>Adoption Invoice Ready</h2>
    <p>Dear ${invoice.adoptingParent?.name || 'Adopting Parent'},</p>
    <p>Your official adoption invoice (<strong>#${invoice.invoiceNumber}</strong>) has been generated by ImperialPaws Pekingese.</p>
    <p>You can view and print your invoice online using the button below:</p>
    <p style="text-align:center;">
      <a href="${invoiceUrl}" class="btn">View Adoption Invoice</a>
    </p>
    <p>If you have any questions regarding your invoice or placement, please reply to this email.</p>
    <p>Warm regards,<br><strong>ImperialPaws Pekingese</strong></p>`
  );

  return sendMailSafe({ to: applicationEmail, subject, text, html });
}

module.exports = {
  isEmailEnabled,
  sendApplicationConfirmationEmail,
  sendBreederNewApplicationAlert,
  sendApplicationStatusUpdateEmail,
  sendInvoiceNotificationEmail
};
