/* =====================================================
   ImperialPaws – Luxury Email Notification Service
   Handles automated notifications for:
   - Application Submission Confirmations & Breeder Alerts
   - Application Status Updates (Approved, Processing, Reserved, Sold)
   - Invoice Issued & Payment Notifications
   - Adoption Agreements & Contracts

   Designed for high Primary Inbox deliverability:
   - Multi-part MIME (Clean Plain Text + Luxury Branded HTML)
   - Non-blocking async dispatch with robust error boundaries
   - Configurable enable/disable toggle & Spacemail defaults
===================================================== */
const nodemailer = require("nodemailer");
const { loadSiteSettings } = require("./siteSettings");

// SMTP Configuration from Environment with defaults for Spaceship / Spacemail
const SMTP_HOST = process.env.SMTP_HOST || "mail.spaceship.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_SECURE = process.env.SMTP_SECURE !== "false"; // true for port 465 SSL/TLS
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
 * Base email layout wrapper with state-of-the-art luxury styling.
 */
function wrapHtmlContent(title, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #121210;
      color: #222222;
      margin: 0;
      padding: 24px 12px;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 620px;
      margin: 0 auto;
      background: #FBF9F5;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
      border: 1px solid #33322D;
    }
    .email-header {
      background: linear-gradient(180deg, #1A1916 0%, #24221E 100%);
      color: #ffffff;
      text-align: center;
      padding: 36px 24px 30px;
      border-bottom: 3px solid #C7A45A;
    }
    .email-header h1 {
      font-family: Georgia, 'Times New Roman', serif;
      margin: 0;
      font-size: 26px;
      font-weight: normal;
      letter-spacing: 2px;
      color: #C7A45A;
    }
    .email-header p {
      margin: 6px 0 0;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: #E2DDD3;
      opacity: 0.9;
    }
    .email-body {
      padding: 40px 36px;
      line-height: 1.8;
      font-size: 15px;
      color: #333333;
    }
    .email-body h2 {
      font-family: Georgia, 'Times New Roman', serif;
      color: #1A1916;
      font-size: 22px;
      margin-top: 0;
      margin-bottom: 16px;
      font-weight: normal;
    }
    .email-body p {
      margin: 0 0 16px;
    }
    .callout-box {
      background: #F4EFEB;
      border-left: 4px solid #C7A45A;
      border-radius: 6px;
      padding: 20px;
      margin: 24px 0;
    }
    .code-box {
      background: #FFFFFF;
      border: 1.5px dashed #C7A45A;
      border-radius: 10px;
      padding: 20px;
      text-align: center;
      margin: 26px 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    }
    .code-box span {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #777777;
      margin-bottom: 6px;
    }
    .code-box strong {
      font-size: 22px;
      letter-spacing: 3px;
      color: #5C4414;
      font-family: monospace;
    }
    .btn-wrapper {
      text-align: center;
      margin: 32px 0 24px;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #D4AF37 0%, #B89128 100%);
      color: #111111 !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.5px;
      padding: 14px 34px;
      border-radius: 999px;
      box-shadow: 0 4px 14px rgba(199, 164, 90, 0.35);
    }
    .status-badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .status-approved { background: #E6F4EA; color: #166534; border: 1px solid #A7F3D0; }
    .status-pending { background: #FEF9C3; color: #854D0E; border: 1px solid #FDE047; }
    .status-declined { background: #FEE2E2; color: #991B1B; border: 1px solid #FECACA; }
    .email-footer {
      background: #EFECE6;
      text-align: center;
      padding: 28px 24px;
      font-size: 12px;
      color: #666666;
      border-top: 1px solid #E2DDD3;
      line-height: 1.6;
    }
    .email-footer a {
      color: #5C4414;
      text-decoration: none;
      font-weight: 600;
    }
    @media (max-width: 600px) {
      .email-body { padding: 28px 20px; }
      .email-header { padding: 28px 16px 22px; }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>ImperialPaws</h1>
      <p>Ethical Pekingese Breeding Program</p>
    </div>
    <div class="email-body">
      ${contentHtml}
    </div>
    <div class="email-footer">
      &copy; ${new Date().getFullYear()} ImperialPaws Pekingese. All rights reserved.<br>
      Responsible Home-Raised Pekingese Placement &bull; USA<br><br>
      <a href="https://imperialpaws.pet">imperialpaws.pet</a> &bull; <a href="mailto:info@imperialpaws.pet">info@imperialpaws.pet</a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send email safely without blocking execution or throwing unhandled rejections.
 */
async function sendMailSafe({ to, subject, text, html }) {
  try {
    const enabled = await isEmailEnabled();
    if (!enabled) {
      console.log(`[Email Notice] Email disabled or credentials missing. Skipped sending "${subject}" to ${to}`);
      return false;
    }

    const mailOptions = {
      from: DEFAULT_FROM,
      to,
      subject,
      text,
      html,
      headers: {
        "X-Mailer": "ImperialPaws Luxury Placement System",
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
 * Trigger: New Application Submitted Confirmation (To Adopter)
 */
async function sendApplicationConfirmationEmail(application, baseUrl = "https://imperialpaws.pet") {
  if (!application || !application.email) return;

  const trackUrl = `${baseUrl}/track?code=${encodeURIComponent(application.trackingCode || application.id)}`;
  const subject = `Application Received: ${application.name} – ImperialPaws Pekingese`;

  const text = `Hello ${application.name},\n\nThank you for submitting your adoption application to ImperialPaws Pekingese.\n\nYour Application Tracking Code is: ${application.trackingCode || application.id}\n\nYou can track the status of your application anytime at:\n${trackUrl}\n\nWe review each application carefully and will reach out to you shortly regarding next steps.\n\nWarmest regards,\nImperialPaws Pekingese`;

  const html = wrapHtmlContent(
    "Application Received",
    `<h2>Thank you for your application, ${application.name}!</h2>
    <p>We have successfully received your adoption application for one of our home-raised Pekingese puppies. Our breeding team reviews every applicant personally to ensure thoughtful, loving lifelong placements.</p>
    <div class="code-box">
      <span>Your Private Tracking Code</span>
      <strong>${application.trackingCode || application.id}</strong>
    </div>
    <p>You can verify your application status, review updates, or access placement documentation anytime on our tracking portal:</p>
    <div class="btn-wrapper">
      <a href="${trackUrl}" class="btn">Track Your Application</a>
    </div>
    <div class="callout-box">
      <strong>What Happens Next?</strong><br>
      Our team typically completes review within 24 to 48 hours. Once approved, you will receive an email notification with guidance on reserving your puppy and reviewing adoption documentation.
    </div>
    <p>If you have any immediate questions, feel free to reply directly to this email or reach our team at <a href="mailto:info@imperialpaws.pet">info@imperialpaws.pet</a>.</p>
    <p>Warmest regards,<br><strong>ImperialPaws Pekingese</strong></p>`
  );

  return sendMailSafe({ to: application.email, subject, text, html });
}

/**
 * Trigger: Breeder Alert on New Application (To Admin / info@imperialpaws.pet)
 */
async function sendBreederNewApplicationAlert(application) {
  const subject = `🐾 New Adoption Application: ${application.name}`;
  const text = `New application received!\nName: ${application.name}\nEmail: ${application.email}\nPhone: ${application.phone || 'N/A'}\nLocation: ${application.location || 'N/A'}\nTracking Code: ${application.trackingCode || application.id}\nMessage: ${application.message || 'None'}`;
  
  const html = wrapHtmlContent(
    "New Application Alert",
    `<h2>🐾 New Application Received</h2>
    <p>A prospective adopter has just submitted an adoption application on <strong>imperialpaws.pet</strong>.</p>
    <div class="callout-box">
      <p style="margin-bottom: 8px;"><strong>Applicant:</strong> ${application.name}</p>
      <p style="margin-bottom: 8px;"><strong>Email:</strong> <a href="mailto:${application.email}">${application.email}</a></p>
      <p style="margin-bottom: 8px;"><strong>Phone:</strong> ${application.phone || 'N/A'}</p>
      <p style="margin-bottom: 8px;"><strong>Location:</strong> ${application.location || 'N/A'}</p>
      <p style="margin-bottom: 0;"><strong>Tracking Code:</strong> <code>${application.trackingCode || application.id}</code></p>
    </div>
    ${application.message ? `<p><strong>Applicant Note:</strong><br><em>"${application.message}"</em></p>` : ''}
    <div class="btn-wrapper">
      <a href="https://imperialpaws.pet/admin/applications" class="btn">Review in Admin Panel</a>
    </div>`
  );

  return sendMailSafe({ to: "info@imperialpaws.pet", subject, text, html });
}

/**
 * Trigger: Application Status Updated (Approved, Processing, Declined, Reserved)
 */
async function sendApplicationStatusUpdateEmail(application, newStatus, baseUrl = "https://imperialpaws.pet") {
  if (!application || !application.email) return;

  const trackUrl = `${baseUrl}/track?code=${encodeURIComponent(application.trackingCode || application.id)}`;
  const statusFormatted = String(newStatus).toUpperCase();
  const subject = `Application Status Update: ${statusFormatted} – ImperialPaws Pekingese`;

  let badgeClass = "status-pending";
  if (newStatus.toLowerCase() === "approved") badgeClass = "status-approved";
  if (["declined", "rejected"].includes(newStatus.toLowerCase())) badgeClass = "status-declined";

  let statusMessage = "";
  if (newStatus.toLowerCase() === "approved") {
    statusMessage = `<div class="callout-box" style="background:#F0FDF4; border-color:#22C55E; color:#166534;">
      <strong style="font-size:16px;">Congratulations! Your application is APPROVED.</strong><br>
      We are delighted to welcome you to the ImperialPaws family. Our team is now preparing your adoption agreement and reservation invoice. We will reach out shortly to discuss delivery options and final arrangements.
    </div>`;
  } else if (["declined", "rejected"].includes(newStatus.toLowerCase())) {
    statusMessage = `<p>Thank you for your interest in ImperialPaws Pekingese. After careful consideration, we are unable to move forward with your application for our current litters. We appreciate the time you took to apply and wish you the very best in finding the perfect companion.</p>`;
  } else {
    statusMessage = `<p>Your adoption application status has been updated to: <span class="status-badge ${badgeClass}">${newStatus}</span>.</p>`;
  }

  const text = `Hello ${application.name},\n\nYour adoption application status has been updated to: ${statusFormatted}.\n\nTrack your application at:\n${trackUrl}\n\nImperialPaws Pekingese`;

  const html = wrapHtmlContent(
    `Status Update: ${statusFormatted}`,
    `<h2>Application Status Update</h2>
    <p>Dear ${application.name},</p>
    <p>We are writing to inform you of an update regarding your Pekingese adoption application (Reference: <strong>${application.trackingCode || application.id}</strong>).</p>
    <div style="margin: 20px 0;">
      Status: <span class="status-badge ${badgeClass}">${newStatus}</span>
    </div>
    ${statusMessage}
    <div class="btn-wrapper">
      <a href="${trackUrl}" class="btn">View Application Portal</a>
    </div>
    <p>Thank you for your trust and patience during our review process.</p>
    <p>Warm regards,<br><strong>ImperialPaws Pekingese</strong></p>`
  );

  return sendMailSafe({ to: application.email, subject, text, html });
}

/**
 * Trigger: Invoice Issued Notification (To Adopter)
 */
async function sendInvoiceNotificationEmail(invoice, applicationEmail, baseUrl = "https://imperialpaws.pet") {
  if (!applicationEmail) return;

  const invoiceUrl = invoice.applicationId
    ? `${baseUrl}/invoice/${encodeURIComponent(invoice.applicationId)}/${encodeURIComponent(invoice.invoiceNumber)}`
    : `${baseUrl}/invoice/${encodeURIComponent(invoice.invoiceNumber)}`;

  const subject = `Adoption Invoice Issued #${invoice.invoiceNumber} – ImperialPaws Pekingese`;
  const totalAmount = invoice.items?.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0) || 0;
  const currency = invoice.currency || "$";

  const text = `Hello ${invoice.adoptingParent?.name || 'there'},\n\nYour official ImperialPaws adoption invoice (#${invoice.invoiceNumber}) has been issued for the amount of ${currency}${totalAmount}.\n\nView and print your invoice securely online at:\n${invoiceUrl}\n\nThank you,\nImperialPaws Pekingese`;

  const html = wrapHtmlContent(
    `Invoice #${invoice.invoiceNumber}`,
    `<h2>Official Adoption Invoice Issued</h2>
    <p>Dear ${invoice.adoptingParent?.name || 'Adopting Parent'},</p>
    <p>Your official adoption statement and payment request (<strong>#${invoice.invoiceNumber}</strong>) has been generated by ImperialPaws Pekingese.</p>
    <div class="callout-box">
      <p style="margin-bottom: 8px;"><strong>Invoice Number:</strong> #${invoice.invoiceNumber}</p>
      <p style="margin-bottom: 8px;"><strong>Issue Date:</strong> ${invoice.issueDate || new Date().toLocaleDateString("en-US")}</p>
      ${invoice.dueDate ? `<p style="margin-bottom: 8px;"><strong>Due Date:</strong> ${invoice.dueDate}</p>` : ''}
      <p style="margin-bottom: 0; font-size:17px;"><strong>Total Amount:</strong> <strong style="color:#5C4414;">${currency}${totalAmount}</strong></p>
    </div>
    <p>Please review your invoice details and payment instructions using the secure link below:</p>
    <div class="btn-wrapper">
      <a href="${invoiceUrl}" class="btn">View & Print Adoption Invoice</a>
    </div>
    <p>If you have any questions or require assistance completing your reservation fee, simply reply to this email or reach us at <a href="mailto:info@imperialpaws.pet">info@imperialpaws.pet</a>.</p>
    <p>Warmest regards,<br><strong>ImperialPaws Pekingese</strong></p>`
  );

  return sendMailSafe({ to: applicationEmail, subject, text, html });
}

/**
 * Trigger: Send Adoption Agreement / Contract to Adopter
 */
async function sendContractEmail(contractTitle, buyerName, buyerEmail, contractViewUrl, baseUrl = "https://imperialpaws.pet") {
  if (!buyerEmail) return;

  const subject = `Adoption Agreement Ready for Review: ${contractTitle} – ImperialPaws Pekingese`;

  const text = `Hello ${buyerName || 'Adopting Parent'},\n\nYour official Pekingese Adoption Agreement (${contractTitle}) is ready for your review and signature.\n\nView Agreement:\n${contractViewUrl}\n\nWarm regards,\nImperialPaws Pekingese`;

  const html = wrapHtmlContent(
    "Adoption Agreement Ready",
    `<h2>Adoption Agreement Ready for Review</h2>
    <p>Dear ${buyerName || 'Adopting Parent'},</p>
    <p>Your official adoption agreement, <strong>${contractTitle}</strong>, is now ready for your review and records.</p>
    <p>Please review the health guarantee, care guidelines, and ownership transfer terms outlined in the document:</p>
    <div class="btn-wrapper">
      <a href="${contractViewUrl}" class="btn">View & Print Adoption Agreement</a>
    </div>
    <p>If you have any questions about any clause before signing, please reply directly to this email so we can discuss and finalize your puppy's placement.</p>
    <p>Warmest regards,<br><strong>ImperialPaws Pekingese</strong></p>`
  );

  return sendMailSafe({ to: buyerEmail, subject, text, html });
}

/**
 * Trigger: Send Admin Test Email
 */
async function sendTestEmail(toEmail) {
  if (!toEmail) return false;
  const subject = `✅ ImperialPaws Spacemail SMTP Verification`;
  const text = `Congratulations! Your Spacemail SMTP server (mail.spaceship.com) is properly configured and sending emails successfully for ImperialPaws Pekingese.`;
  const html = wrapHtmlContent(
    "SMTP Verification Success",
    `<h2>✅ Spacemail SMTP Verification</h2>
    <p>Congratulations! Your email system is working flawlessly.</p>
    <div class="callout-box" style="background:#F0FDF4; border-color:#22C55E; color:#166534;">
      <strong>All Systems Operational</strong><br>
      Your server at <strong>mail.spaceship.com</strong> is successfully authenticated with <code>info@imperialpaws.pet</code>. Automated emails will now reach your applicants and your breeder inbox reliably.
    </div>
    <p>Sent at: <strong>${new Date().toLocaleString()}</strong></p>`
  );
  return sendMailSafe({ to: toEmail, subject, text, html });
}

module.exports = {
  isEmailEnabled,
  sendApplicationConfirmationEmail,
  sendBreederNewApplicationAlert,
  sendApplicationStatusUpdateEmail,
  sendInvoiceNotificationEmail,
  sendContractEmail,
  sendTestEmail
};
