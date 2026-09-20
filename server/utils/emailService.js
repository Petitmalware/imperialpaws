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
const { getCurrencySymbol } = require("./currency");

const SMTP_HOST = process.env.SMTP_HOST || "mail.spacemail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_SECURE = process.env.SMTP_SECURE !== "false"; // true for port 465 SSL/TLS
const SMTP_USER = process.env.SMTP_USER || "info@imperialpaws.pet";
const SMTP_PASS = process.env.SMTP_PASS || "Imperialpaws$16$";
const DEFAULT_FROM = process.env.SMTP_FROM || `"ImperialPaws Pekingese" <info@imperialpaws.pet>`;

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (process.env.NODE_ENV === "test") {
      transporter = nodemailer.createTransport({ jsonTransport: true });
      return transporter;
    }
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
async function sendMailSafe({ to, subject, text, html, attachments = [] }) {
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
      attachments,
      headers: {
        "X-Mailer": "ImperialPaws Luxury Placement System",
        "X-Priority": "3"
      }
    };

    const info = await getTransporter().sendMail(mailOptions);
    console.log(`[Email ${process.env.NODE_ENV === "test" ? "Preview" : "Sent"}] "${subject}" to ${to} (MessageId: ${info.messageId})`);
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
 * Trigger: Application Status Updated (Approved, Rejected, Sold, etc.)
 * When Approved: shows clean transparent approval with puppy name + adoption fee only.
 */
async function sendApplicationStatusUpdateEmail(application, newStatus, baseUrl = "https://imperialpaws.pet", puppy = null) {
  if (!application || !application.email) return;

  const trackUrl = `${baseUrl}/track?code=${encodeURIComponent(application.trackingCode || application.id)}`;
  const statusFormatted = String(newStatus).toUpperCase();

  // --- APPROVED: clean, transparent approval email ---
  if (newStatus.toLowerCase() === "approved") {
    const puppyName = puppy?.name || application.puppyName || "your selected puppy";
    const adoptionFee = puppy?.price ? `${getCurrencySymbol(puppy.currency)}${puppy.price}` : "the listed adoption fee";
    const subject = `Your Adoption Application Has Been Approved – ImperialPaws`;
    const text = `Dear ${application.name},\n\nCongratulations! Your adoption application for ${puppyName} has been approved.\n\nThe next step is completing the adoption by paying the listed adoption fee shown on our website.\n\nAdoption Fee: ${adoptionFee}\n\nAn adoption invoice will be generated for you shortly. Once payment is confirmed, ${puppyName} will be marked as Sold and reserved exclusively for you.\n\nIf you have any questions before completing payment, we are happy to help.\n\nThank you for choosing Imperial Paws.\n\nBest regards,\nImperialPaws\nImperialPaws.pet`;
    const html = wrapHtmlContent(
      "Your Adoption Application Has Been Approved",
      `<h2>Congratulations, ${application.name}!</h2>
      <p>We are pleased to let you know that your adoption application for <strong>${puppyName}</strong> has been approved.</p>
      <p>The next step is completing the adoption by paying the listed adoption fee shown on our website.</p>
      <div class="callout-box" style="background:#F0FDF4; border-color:#22C55E; color:#166534;">
        <p style="margin-bottom:8px;"><strong>Puppy:</strong> ${puppyName}</p>
        <p style="margin-bottom:0; font-size:18px;"><strong>Adoption Fee:</strong> <strong>${adoptionFee}</strong></p>
      </div>
      <p>An adoption invoice has been generated for you. Please review it and submit payment using the available payment method.</p>
      <p>Once payment has been confirmed, <strong>${puppyName}</strong> will immediately be marked as <strong>Sold</strong> and reserved exclusively for you.</p>
      <div class="callout-box">
        <strong>What Happens Next?</strong><br>
        1. Review your invoice — it reflects the exact adoption fee listed on our website with no additional charges.<br>
        2. Submit payment via the invoice link.<br>
        3. We will confirm your reservation and arrange pickup or delivery.
      </div>
      <div class="btn-wrapper">
        <a href="${trackUrl}" class="btn">View Your Application Portal</a>
      </div>
      <p>If you have any questions before completing payment, we are happy to help. Simply reply to this email or reach us at <a href="mailto:info@imperialpaws.pet">info@imperialpaws.pet</a>.</p>
      <p>Thank you for choosing Imperial Paws.<br><br>Best regards,<br><strong>ImperialPaws</strong><br>ImperialPaws.pet</p>`
    );
    return sendMailSafe({ to: application.email, subject, text, html });
  }

  // --- REJECTED ---
  if (["declined", "rejected"].includes(newStatus.toLowerCase())) {
    const subject = `Regarding Your Adoption Application – ImperialPaws`;
    const text = `Dear ${application.name},\n\nThank you for your interest in ImperialPaws Pekingese. After careful consideration, we are unable to move forward with your application at this time. We appreciate the time you took to apply and wish you the very best.\n\nImperialPaws Pekingese`;
    const html = wrapHtmlContent(
      "Regarding Your Adoption Application",
      `<h2>Regarding Your Application</h2>
      <p>Dear ${application.name},</p>
      <p>Thank you for your interest in ImperialPaws Pekingese. After careful consideration, we are unable to move forward with your application for our current litters.</p>
      <p>We appreciate the time you took to apply and wish you the very best in finding the perfect companion.</p>
      <p>Warm regards,<br><strong>ImperialPaws Pekingese</strong></p>`
    );
    return sendMailSafe({ to: application.email, subject, text, html });
  }

  // --- OTHER STATUS UPDATES ---
  const subject = `Application Update: ${statusFormatted} – ImperialPaws`;
  const text = `Dear ${application.name},\n\nYour adoption application status has been updated to: ${statusFormatted}.\n\nTrack your application at: ${trackUrl}\n\nImperialPaws Pekingese`;
  const html = wrapHtmlContent(
    `Application Update: ${statusFormatted}`,
    `<h2>Application Status Update</h2>
    <p>Dear ${application.name},</p>
    <p>Your adoption application (Reference: <strong>${application.trackingCode || application.id}</strong>) has been updated to: <span class="status-badge status-pending">${newStatus}</span>.</p>
    <div class="btn-wrapper"><a href="${trackUrl}" class="btn">View Application Portal</a></div>
    <p>Warm regards,<br><strong>ImperialPaws Pekingese</strong></p>`
  );
  return sendMailSafe({ to: application.email, subject, text, html });
}

/**
 * Trigger: Invoice Issued Notification (To Adopter)
 * Reflects exact adoption fee — no hidden charges language.
 */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function sendInvoiceDocumentEmail(invoice, recipient, heading) {
  if (!recipient || !(await isEmailEnabled())) return false;
  const { invoicePdf } = require('./documentPdf');
  const { saveDelivery } = require('./documentDelivery');
  const pdf = await invoicePdf(invoice);
  const filename = 'Adoption-Invoice-' + String(invoice.invoiceNumber).replace(/[^a-zA-Z0-9_-]/g, '-') + '.pdf';
  const delivery = await saveDelivery(pdf, filename);
  const name = invoice.adoptingParent?.name || 'Adopting Parent';
  const subject = heading + ': ' + invoice.invoiceNumber;
  const text = 'Hello ' + name + ',\n\nYour adoption invoice is attached as a PDF. You can also download the same copy from our website without logging in:\n' + delivery.url + '\n\nPlease keep this private link with your puppy records.';
  const html = wrapHtmlContent(escapeHtml(heading), '<h2>' + escapeHtml(heading) + '</h2><p>Hello ' + escapeHtml(name) + ',</p><p>Your adoption invoice is attached as a PDF. Save the attachment to your device, or download the same copy using the link below. No account or login is needed.</p><div class="btn-wrapper"><a class="btn" href="' + escapeHtml(delivery.url) + '">Download invoice PDF</a></div><p>Please keep this private link with your puppy records.</p>');
  return sendMailSafe({to:recipient,subject,text,html,attachments:[delivery.attachment]});
}

async function sendInvoiceNotificationEmail(invoice, recipient) {
  return sendInvoiceDocumentEmail(invoice, recipient, 'Your adoption invoice');
}
async function sendPaymentReceivedEmail(invoice, recipient) {
  return sendInvoiceDocumentEmail(invoice, recipient, 'Adoption payment recorded');
}
async function sendPaymentReminderEmail(invoice, recipient) {
  return sendInvoiceDocumentEmail(invoice, recipient, 'Adoption payment reminder');
}

async function sendManualReplyEmail({ toEmail, toName, subject, messageBody }) {
  if (!toEmail || !messageBody) return false;
  const emailSubject = subject || `A Message from ImperialPaws`;
  const text = `Dear ${toName || "there"},\n\n${messageBody}\n\nBest regards,\nImperialPaws\nImperialPaws.pet`;
  const html = wrapHtmlContent(
    emailSubject,
    `<h2>A Message from ImperialPaws</h2>
    <p>Dear ${toName || "there"},</p>
    <div style="margin: 16px 0; padding: 20px; border-left: 4px solid #C7A45A; background: #FFFDF9; line-height: 1.8; color: #222; white-space: pre-wrap;">${String(messageBody).trim().replace(/\n/g, "<br>")}</div>
    <p>Best regards,<br><strong>ImperialPaws</strong><br><a href="https://imperialpaws.pet">ImperialPaws.pet</a></p>`
  );
  return sendMailSafe({ to: toEmail, subject: emailSubject, text, html });
}

/**
 * Trigger: Send Adoption Agreement / Contract to Adopter
 */
async function sendContractEmail(contract, buyerName, buyerEmail) {
  if (!buyerEmail || !(await isEmailEnabled())) return false;
  const { contractPdf } = require('./documentPdf');
  const { saveDelivery } = require('./documentDelivery');
  const pdf = await contractPdf(contract, buyerName);
  const delivery = await saveDelivery(pdf, 'Adoption-Agreement.pdf');
  const subject = 'Your adoption agreement: ' + contract.title;
  const text = 'Hello ' + buyerName + ',\n\nYour one-page adoption agreement is attached as a PDF for review and signature. You can also download the same copy without logging in:\n' + delivery.url + '\n\nPlease keep this private link with your puppy records.';
  const html = wrapHtmlContent('Adoption agreement', '<h2>Your adoption agreement</h2><p>Hello ' + escapeHtml(buyerName) + ',</p><p>Your one-page agreement, <strong>' + escapeHtml(contract.title) + '</strong>, is attached as a PDF for review and signature.</p><p>You can also download the same copy from our website. No account or admin login is needed.</p><div class="btn-wrapper"><a class="btn" href="' + escapeHtml(delivery.url) + '">Download agreement PDF</a></div><p>Please keep this private link with your puppy records.</p>');
  return sendMailSafe({to:buyerEmail,subject,text,html,attachments:[delivery.attachment]});
}

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

/**
 * Trigger: Breeder to Adopter Lifecycle Stage Guidance Email
 */
async function sendAdopterLifecycleEmail({ application, stageType, customNote, baseUrl = "https://imperialpaws.pet" }) {
  if (!application || !application.email) return;

  const trackUrl = `${baseUrl}/track?code=${encodeURIComponent(application.trackingCode || application.id)}`;
  let stageTitle = "";
  let stageHeadline = "";
  let stageBody = "";

  switch (stageType) {
    case "under_review":
      stageTitle = "Application Under Review & Next Steps";
      stageHeadline = "We Are Reviewing Your Application";
      stageBody = `<p>Our breeding team is currently reviewing your adoption application for your selected Pekingese companion. We take great care in matching our home-raised puppies with wonderful families.</p>
      <div class="callout-box">
        <strong>What You Can Prepare Now:</strong><br>
        • Review our care recommendations and breed guidelines on our website.<br>
        • Ensure your home environment is ready for a toy breed puppy.<br>
        • Be on the lookout for our final decision via email within 24–48 hours.
      </div>`;
      break;

    case "approved_guidance":
      stageTitle = "Application Approved – Reservation Instructions";
      stageHeadline = "Congratulations! Your Application is Approved 🎉";
      stageBody = `<p>We are thrilled to officially approve your adoption application! You are now approved to move forward with reserving your ImperialPaws Pekingese puppy.</p>
      <div class="callout-box" style="background:#F0FDF4; border-color:#22C55E; color:#166534;">
        <strong>Next Steps to Secure Your Puppy:</strong><br>
        1. Review and sign your official Adoption Agreement sent to your email.<br>
        2. Complete your holding fee / reservation deposit via your secure invoice link.<br>
        3. Once reserved, we will coordinate weekly photo/video updates up until pickup/delivery!
      </div>`;
      break;

    case "deposit_received":
      stageTitle = "Deposit Confirmed – Puppy Preparation Checklist";
      stageHeadline = "Deposit Received – Your Puppy is Reserved! 🐾";
      stageBody = `<p>Thank you! We have confirmed receipt of your reservation deposit. Your Pekingese puppy is now officially reserved and off the market.</p>
      <div class="callout-box">
        <strong>Puppy Preparation Check-list:</strong><br>
        • <strong>Food:</strong> We recommend premium small-breed puppy kibble (we will provide sample starter pack).<br>
        • <strong>Comfort:</strong> A cozy small bed, slicker brush, and stainless steel bowls.<br>
        • <strong>Veterinary:</strong> Schedule an introductory wellness check with your local veterinarian for your puppy's arrival week.
      </div>`;
      break;

    case "pre_delivery":
      stageTitle = "Final Payment & Pickup / Delivery Coordination";
      stageHeadline = "Preparing for Homecoming Day!";
      stageBody = `<p>As your puppy's homecoming date approaches, we want to ensure every detail is smoothly coordinated between now and delivery/pickup.</p>
      <div class="callout-box">
        <strong>Final Arrangements:</strong><br>
        • <strong>Remaining Balance:</strong> Please ensure the final invoice balance is settled prior to scheduled transport or at local pickup.<br>
        • <strong>Flight Nanny / Ground Transport:</strong> If opting for delivery, our flight nanny will contact you with exact flight itineraries and airport meeting details.<br>
        • <strong>Local Pickup:</strong> If picking up in person, please confirm your preferred arrival time window with us.
      </div>`;
      break;

    case "welcome_home":
      stageTitle = "Pekingese Care Guide & Welcome Home Check-in";
      stageHeadline = "Welcome to the ImperialPaws Family! 👑";
      stageBody = `<p>We are so excited for your new puppy's arrival! To ensure the smoothest transition into your home, please keep these key care rules in mind:</p>
      <div class="callout-box">
        <strong>Essential Care Reminders:</strong><br>
        • <strong>Rest & Quiet:</strong> Puppies need ample sleep during their first week. Keep introductions calm.<br>
        • <strong>Hydration & Meals:</strong> Offer fresh water and small, frequent meals to prevent hypoglycemia.<br>
        • <strong>Temperature Control:</strong> Pekingese are sensitive to heat—ensure a cool, well-ventilated space.
      </div>`;
      break;

    default:
      stageTitle = "Breeder Update & Communication";
      stageHeadline = "An Update from Your Breeder";
      stageBody = `<p>We are sending a quick update regarding your Pekingese adoption process.</p>`;
  }

  const customSection = customNote && String(customNote).trim()
    ? `<div style="margin: 20px 0; padding: 16px; border-left: 4px solid #c7a45a; background: #fffdf9; font-size: 15px; color: #333;">
        <strong style="color: #1a1a1a; display: block; margin-bottom: 6px;">Personal Note from Breeder:</strong>
        ${String(customNote).trim().replace(/\n/g, '<br>')}
      </div>`
    : "";

  const subject = `${stageTitle} – ImperialPaws Pekingese`;
  const text = `Hello ${application.name},\n\n${stageTitle}\n\n${customNote ? `Note: ${customNote}\n\n` : ''}Track your application: ${trackUrl}\n\nImperialPaws Pekingese`;

  const html = wrapHtmlContent(
    stageTitle,
    `<h2>${stageHeadline}</h2>
    <p>Dear ${application.name},</p>
    ${stageBody}
    ${customSection}
    <div class="btn-wrapper">
      <a href="${trackUrl}" class="btn">View Your Application Portal</a>
    </div>
    <p>If you have any questions along the way, simply reply directly to this email or reach us at <a href="mailto:info@imperialpaws.pet">info@imperialpaws.pet</a>.</p>
    <p>Warmest regards,<br><strong>ImperialPaws Pekingese</strong></p>`
  );

  return sendMailSafe({ to: application.email, subject, text, html });
}

/**
 * Trigger: Adoption Complete — Puppy Delivered / Picked Up
 * Final email in the full lifecycle. Sent by breeder after handover.
 */
async function sendAdoptionCompleteEmail({ application, puppy, customNote, baseUrl = "https://imperialpaws.pet" }) {
  if (!application || !application.email) return;

  const puppyName = puppy?.name || application.puppyName || "your new puppy";
  const subject = `Welcome Home, ${puppyName}! — Adoption Complete`;

  const customSection = customNote && String(customNote).trim()
    ? `<div style="margin:20px 0; padding:16px; border-left:4px solid #C7A45A; background:#FFFDF9; font-size:15px; color:#333;">
        <strong style="display:block; margin-bottom:6px; color:#1a1a1a;">A Personal Note from Your Breeder:</strong>
        ${String(customNote).trim().replace(/\n/g, "<br>")}
      </div>`
    : "";

  const text = `Dear ${application.name},\n\nCongratulations! The adoption of ${puppyName} is now complete.\n\nWelcome to the ImperialPaws family! 👑\n\n---\nPekingese Care Essentials:\n\n• REST: Puppies need 16-18 hrs of sleep. Keep first days calm and quiet.\n• FOOD: Small, frequent meals 3-4x daily. Premium small-breed puppy kibble.\n• WATER: Fresh water available at all times. Pekingese can be prone to hypoglycemia.\n• GROOMING: Brush daily around the face and eyes. Their coat needs regular gentle brushing.\n• HEAT: Pekingese are VERY heat sensitive. Never leave in a hot car or direct sun.\n• VET: Schedule a wellness check within the first week of arrival.\n• LOVE: They are loyal, gentle companions — give them time to settle in.\n---\n\n${customNote ? `Personal note: ${customNote}\n\n` : ""}We are always here if you have questions. Email us anytime at info@imperialpaws.pet.\n\nThank you for choosing ImperialPaws.\n\nWith warmest regards,\nImperialPaws Pekingese`;

  const html = wrapHtmlContent(
    `Welcome Home, ${puppyName}! — Adoption Complete`,
    `<h2>Welcome to the ImperialPaws Family! 👑</h2>
    <p>Dear ${application.name},</p>
    <p>Congratulations! The adoption of <strong>${puppyName}</strong> is now officially complete. We are so happy for you and your new family member.</p>
    ${customSection}
    <div class="callout-box" style="background:#F0FDF4; border-color:#22C55E; color:#166534;">
      <strong style="font-size:16px;">🐾 Adoption Complete — ${puppyName} Is Home!</strong><br>
      Thank you for trusting ImperialPaws Pekingese. It has been our absolute pleasure placing ${puppyName} with your family.
    </div>
    <h2 style="font-family:Georgia,serif; font-size:18px; margin-top:28px; margin-bottom:12px; color:#1A1916;">Pekingese Care Essentials</h2>
    <div class="callout-box">
      <p style="margin-bottom:8px;">🛌 <strong>Rest:</strong> Puppies need 16–18 hours of sleep. Keep the first few days calm and quiet to help them settle.</p>
      <p style="margin-bottom:8px;">🍽️ <strong>Food:</strong> Small, frequent meals 3–4 times daily using premium small-breed puppy kibble.</p>
      <p style="margin-bottom:8px;">💧 <strong>Water:</strong> Fresh water at all times. Pekingese puppies can be prone to low blood sugar — never skip meals.</p>
      <p style="margin-bottom:8px;">🌡️ <strong>Heat Sensitivity:</strong> Pekingese are extremely heat sensitive. Keep them cool. Never in a hot car or direct sun.</p>
      <p style="margin-bottom:8px;">✂️ <strong>Grooming:</strong> Brush daily around the face and eyes. Their beautiful coat needs regular gentle attention.</p>
      <p style="margin-bottom:0;">🏥 <strong>Vet Visit:</strong> Schedule a wellness check within the first week of arrival to establish their health record.</p>
    </div>
    <p>We are always here for you. If you ever have questions about your Pekingese, simply reply to this email or reach us at <a href="mailto:info@imperialpaws.pet">info@imperialpaws.pet</a>.</p>
    <p>Thank you for choosing ImperialPaws. We hope ${puppyName} brings your family endless joy. 🐾</p>
    <p>With warmest regards,<br><strong>ImperialPaws Pekingese</strong><br>ImperialPaws.pet</p>`
  );

  return sendMailSafe({ to: application.email, subject, text, html });
}

module.exports = {
  isEmailEnabled,
  sendApplicationConfirmationEmail,
  sendBreederNewApplicationAlert,
  sendApplicationStatusUpdateEmail,
  sendInvoiceNotificationEmail,
  sendPaymentReceivedEmail,
  sendPaymentReminderEmail,
  sendManualReplyEmail,
  sendContractEmail,
  sendAdopterLifecycleEmail,
  sendAdoptionCompleteEmail,
  sendTestEmail
};
