/**
 * Standalone booking and payment form service for The Studio Cove.
 * This script does not read from or write to Google Sheets or Excel files.
 */
const BOOKING_CONFIG = {
  recipientEmail: "contact@thestudiocove.me",
  rootFolderName: "The Studio Cove Booking References",
  maxReferenceBytes: 10 * 1024 * 1024,
  cooldownSeconds: 60,
  allowedServices: [
    "Pubmats / Social Posters",
    "Batch / Carousel Pubmats",
    "Key Visual / Hero Posters",
    "Logos & Mini Brand Kits",
    "TikTok / Reels Short-Form",
    "Class Projects & Skits",
    "Event Highlights / SDE Recaps",
    "Event OBB Intros & LED Wall Motion Loops",
    "Other / Custom Request"
  ]
};

const PAYMENT_CONFIG = {
  recipientEmail: "contact@thestudiocove.me",
  rootFolderName: "The Studio Cove Payment Proofs",
  maxProofBytes: 5 * 1024 * 1024,
  cooldownSeconds: 60,
  allowedProviders: ["GCash"]
};

function doGet() {
  return jsonOutput_({
    ok: true,
    service: "The Studio Cove booking and payment forms",
    spreadsheetConnected: false
  });
}

/** Receives rate-card booking inquiries without redirecting the customer. */
function doPost(event) {
  try {
    const rawPayload = event && event.parameter ? event.parameter.payload : "";
    if (!rawPayload) throw new Error("Missing booking payload.");

    const payload = JSON.parse(rawPayload);

    // Quietly accept bot submissions that fill the hidden honeypot field.
    if (normalizeAnswer_(payload.website)) {
      return jsonOutput_({ ok: true });
    }

    if (payload.type === "payment") {
      const result = processPayment_(payload);
      return jsonOutput_({ ok: true, paymentId: result.paymentId });
    }

    const result = processBooking_(payload);
    return jsonOutput_({ ok: true, inquiryId: result.inquiryId });
  } catch (error) {
    console.error(error);
    return jsonOutput_({ ok: false, error: String(error.message || error) });
  }
}

function processBooking_(payload) {
  const booking = {
    fullName: requiredText_(payload.fullName, "Full name", 120),
    email: requiredText_(payload.email, "Email address", 180).toLowerCase(),
    contact: requiredText_(payload.contact, "Contact number or Messenger URL", 240),
    service: requiredText_(payload.service, "Service", 160),
    deadline: requiredText_(payload.deadline, "Target deadline", 40),
    brief: requiredText_(payload.brief, "Project brief", 6000),
    driveLink: normalizeAnswer_(payload.driveLink).slice(0, 1000),
    files: Array.isArray(payload.files) ? payload.files : []
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)) {
    throw new Error("Invalid email address.");
  }
  if (BOOKING_CONFIG.allowedServices.indexOf(booking.service) === -1) {
    throw new Error("Invalid service selection.");
  }
  if (booking.driveLink && !/^https:\/\//i.test(booking.driveLink)) {
    throw new Error("The reference link must use HTTPS.");
  }

  enforceBookingRateLimit_(booking.email);
  validateReferenceFiles_(booking.files);

  const now = new Date();
  const inquiryId = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const referenceFolder = booking.files.length
    ? saveReferenceFiles_(booking.files, booking.fullName, inquiryId)
    : null;

  sendBookingEmail_(booking, inquiryId, referenceFolder);
  CacheService.getScriptCache().put(bookingRateLimitKey_(booking.email), "1", BOOKING_CONFIG.cooldownSeconds);

  return { inquiryId };
}

function processPayment_(payload) {
  const payment = {
    fullName: requiredText_(payload.fullName, "Full name", 120),
    email: normalizeAnswer_(payload.email).slice(0, 180).toLowerCase(),
    purpose: requiredText_(payload.purpose, "Payment purpose", 240),
    provider: requiredText_(payload.provider, "Payment wallet", 40),
    transactionReference: requiredText_(payload.transactionReference, "Transaction reference", 180),
    inquiryId: normalizeAnswer_(payload.inquiryId).slice(0, 120),
    proof: payload.proof || {}
  };

  if (payment.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payment.email)) throw new Error("Invalid email address.");
  if (PAYMENT_CONFIG.allowedProviders.indexOf(payment.provider) === -1) throw new Error("Invalid payment wallet.");

  const proofName = requiredText_(payment.proof.name, "Proof file name", 180);
  const proofType = requiredText_(payment.proof.type, "Proof file type", 120);
  const proofData = requiredText_(payment.proof.data, "Proof file data", 8 * 1024 * 1024);
  if (!/^image\//i.test(proofType)) throw new Error("Payment proof must be an image.");
  if (Math.ceil(proofData.length * 0.75) > PAYMENT_CONFIG.maxProofBytes) throw new Error("Payment proof exceeds the 5 MB limit.");

  const rateLimitKey = "payment-" + bookingRateLimitKey_(payment.email || payment.fullName);
  if (CacheService.getScriptCache().get(rateLimitKey)) throw new Error("Please wait one minute before submitting another payment proof.");

  const now = new Date();
  const paymentId = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const proofFile = savePaymentProof_(proofName, proofType, proofData, payment.fullName, paymentId);
  sendPaymentEmail_(payment, paymentId, proofFile);
  CacheService.getScriptCache().put(rateLimitKey, "1", PAYMENT_CONFIG.cooldownSeconds);

  return { paymentId };
}

function savePaymentProof_(name, mimeType, data, clientName, paymentId) {
  const properties = PropertiesService.getScriptProperties();
  let folder;
  const savedFolderId = properties.getProperty("PAYMENT_PROOF_FOLDER_ID");

  if (savedFolderId) {
    try {
      folder = DriveApp.getFolderById(savedFolderId);
    } catch (error) {
      folder = null;
    }
  }
  if (!folder) {
    folder = DriveApp.createFolder(PAYMENT_CONFIG.rootFolderName);
    properties.setProperty("PAYMENT_PROOF_FOLDER_ID", folder.getId());
  }

  const extensionSafeName = sanitizeFileName_(name);
  const fileName = `${paymentId} - ${sanitizeFileName_(clientName)} - ${extensionSafeName}`;
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, fileName);
  return folder.createFile(blob);
}

function sendPaymentEmail_(payment, paymentId, proofFile) {
  const subject = `[Payment Proof] ${payment.fullName} - ${payment.provider}`;
  const inquiryId = payment.inquiryId || "Not provided";
  const proofUrl = proofFile.getUrl();
  const plainBody = [
    "NEW PAYMENT PROOF",
    "Payment ID: " + paymentId,
    "",
    "CLIENT NAME: " + payment.fullName,
    "EMAIL ADDRESS: " + (payment.email || "Not available — payment page opened directly"),
    "PAYMENT PURPOSE: " + payment.purpose,
    "PAYMENT WALLET: " + payment.provider,
    "TRANSACTION REFERENCE: " + payment.transactionReference,
    "INQUIRY ID: " + inquiryId,
    "PROOF SCREENSHOT: " + proofUrl,
    "",
    "The paid amount is shown in the proof screenshot. Verify the transaction in the wallet before confirming payment."
  ].join("\n");

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#1e2022">
      <div style="background:#1e2022;color:#f4eee8;padding:24px;border-radius:14px 14px 0 0">
        <p style="margin:0 0 6px;color:#c5b4a3;font-size:12px;font-weight:700;letter-spacing:.12em">THE STUDIO COVE</p>
        <h1 style="margin:0;font-size:24px">New payment proof</h1>
        <p style="margin:8px 0 0;color:#d9cec3">Payment ID: ${escapeHtml_(paymentId)}</p>
      </div>
      <div style="border:1px solid #e3ddd7;border-top:0;padding:24px;border-radius:0 0 14px 14px">
        ${emailRow_("Client", payment.fullName)}
        ${emailRow_("Email", payment.email || "Not available — payment page opened directly")}
        ${emailRow_("Purpose", payment.purpose)}
        ${emailRow_("Wallet", payment.provider)}
        ${emailRow_("Transaction reference", payment.transactionReference)}
        ${emailRow_("Inquiry ID", inquiryId)}
        <p style="margin:22px 0 0"><a href="${escapeHtml_(proofUrl)}" style="display:inline-block;background:#c5b4a3;color:#1e2022;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">View payment screenshot</a></p>
        <p style="margin:20px 0 0;color:#6b6763;font-size:12px">The amount is shown in the proof screenshot. Verify the transaction inside ${escapeHtml_(payment.provider)} before marking it paid.</p>
      </div>
    </div>`;

  const mailOptions = {
    to: PAYMENT_CONFIG.recipientEmail,
    subject,
    body: plainBody,
    htmlBody,
    name: "The Studio Cove Payment Verification"
  };
  if (payment.email) mailOptions.replyTo = payment.email;
  MailApp.sendEmail(mailOptions);
}

function sendBookingEmail_(booking, inquiryId, referenceFolder) {
  const subject = `[Booking Inquiry] ${booking.fullName} - ${booking.service}`;
  const folderUrl = referenceFolder ? referenceFolder.getUrl() : "No files uploaded";
  const driveLink = booking.driveLink || "Not provided";
  const plainBody = [
    "NEW BOOKING INQUIRY",
    "Inquiry ID: " + inquiryId,
    "",
    "CLIENT NAME: " + booking.fullName,
    "EMAIL ADDRESS: " + booking.email,
    "CONTACT / MESSENGER: " + booking.contact,
    "SERVICE: " + booking.service,
    "TARGET DEADLINE / EVENT DATE: " + booking.deadline,
    "",
    "PROJECT BRIEF & DELIVERABLE DETAILS:",
    booking.brief,
    "",
    "CLIENT DRIVE LINK: " + driveLink,
    "UPLOADED REFERENCE FILES: " + folderUrl,
    "",
    "Reply directly to this email to contact the client."
  ].join("\n");

  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#1e2022">
      <div style="background:#1e2022;color:#f4eee8;padding:24px;border-radius:14px 14px 0 0">
        <p style="margin:0 0 6px;color:#c5b4a3;font-size:12px;font-weight:700;letter-spacing:.12em">THE STUDIO COVE</p>
        <h1 style="margin:0;font-size:24px">New booking inquiry</h1>
        <p style="margin:8px 0 0;color:#d9cec3">Inquiry ID: ${escapeHtml_(inquiryId)}</p>
      </div>
      <div style="border:1px solid #e3ddd7;border-top:0;padding:24px;border-radius:0 0 14px 14px">
        ${emailRow_("Client", booking.fullName)}
        ${emailRow_("Email", booking.email)}
        ${emailRow_("Contact / Messenger", booking.contact)}
        ${emailRow_("Service", booking.service)}
        ${emailRow_("Deadline / Event Date", booking.deadline)}
        <h2 style="font-size:14px;margin:24px 0 8px">Project brief</h2>
        <p style="white-space:pre-wrap;line-height:1.6;margin:0">${escapeHtml_(booking.brief)}</p>
        <h2 style="font-size:14px;margin:24px 0 8px">References</h2>
        <p style="line-height:1.7;margin:0">Client Drive link: ${emailLinkOrText_(driveLink)}<br>Uploaded files: ${emailLinkOrText_(folderUrl)}</p>
        <p style="margin:24px 0 0;color:#6b6763;font-size:12px">Reply to this message to contact ${escapeHtml_(booking.fullName)} at ${escapeHtml_(booking.email)}.</p>
      </div>
    </div>`;

  MailApp.sendEmail({
    to: BOOKING_CONFIG.recipientEmail,
    replyTo: booking.email,
    subject,
    body: plainBody,
    htmlBody,
    name: "The Studio Cove Booking Form"
  });
}

function validateReferenceFiles_(files) {
  let totalBytes = 0;
  files.forEach((file, index) => {
    const name = requiredText_(file.name, `Reference file ${index + 1} name`, 180);
    const mimeType = requiredText_(file.type, `Reference file ${index + 1} type`, 120);
    const data = requiredText_(file.data, `Reference file ${index + 1} data`, 16 * 1024 * 1024);
    if (!/^(image|video)\//i.test(mimeType)) throw new Error(`Unsupported reference file: ${name}`);
    totalBytes += Math.ceil(data.length * 0.75);
  });
  if (totalBytes > BOOKING_CONFIG.maxReferenceBytes) {
    throw new Error("Reference files exceed the 10 MB total limit.");
  }
}

function saveReferenceFiles_(files, clientName, inquiryId) {
  const properties = PropertiesService.getScriptProperties();
  let rootFolder;
  const savedFolderId = properties.getProperty("BOOKING_ROOT_FOLDER_ID");

  if (savedFolderId) {
    try {
      rootFolder = DriveApp.getFolderById(savedFolderId);
    } catch (error) {
      rootFolder = null;
    }
  }
  if (!rootFolder) {
    rootFolder = DriveApp.createFolder(BOOKING_CONFIG.rootFolderName);
    properties.setProperty("BOOKING_ROOT_FOLDER_ID", rootFolder.getId());
  }

  const folderName = `${inquiryId} - ${sanitizeFileName_(clientName)}`;
  const inquiryFolder = rootFolder.createFolder(folderName);
  files.forEach(file => {
    const blob = Utilities.newBlob(
      Utilities.base64Decode(file.data),
      file.type,
      sanitizeFileName_(file.name)
    );
    inquiryFolder.createFile(blob);
  });
  return inquiryFolder;
}

function enforceBookingRateLimit_(email) {
  if (CacheService.getScriptCache().get(bookingRateLimitKey_(email))) {
    throw new Error("Please wait one minute before sending another inquiry.");
  }
}

function bookingRateLimitKey_(email) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email.toLowerCase());
  return "booking-" + Utilities.base64EncodeWebSafe(digest).slice(0, 36);
}

function requiredText_(value, label, maxLength) {
  const text = normalizeAnswer_(value);
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > maxLength) throw new Error(`${label} is too long.`);
  return text;
}

function sanitizeFileName_(value) {
  return String(value || "reference").replace(/[\\/:*?"<>|\x00-\x1F]/g, "-").trim().slice(0, 180) || "reference";
}

function emailRow_(label, value) {
  return `<p style="margin:0 0 10px"><strong>${escapeHtml_(label)}:</strong> ${escapeHtml_(value)}</p>`;
}

function emailLinkOrText_(value) {
  const safeValue = escapeHtml_(value);
  return /^https:\/\//i.test(value)
    ? `<a href="${safeValue}" style="color:#5f5145">${safeValue}</a>`
    : safeValue;
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeAnswer_(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

/** Run once after adding booking/payment support to authorize Mail and Drive. */
function testBookingServices() {
  console.log(`Mail recipients remaining today: ${MailApp.getRemainingDailyQuota()}`);
  console.log(`Drive owner root folder: ${DriveApp.getRootFolder().getName()}`);
}
