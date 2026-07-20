const express = require("express");
const router = express.Router();
const multer = require("multer");

const asyncHandler = require("../utils/asyncHandler");
const { requireAdmin, requireOwner } = require("./admin-auth");
const { loadAdmins, saveAdmins } = require("../utils/adminStore");
const { loadSiteSettings, saveSiteSettings } = require("../utils/siteSettings");
const {
  getDataStoreStatus,
  loadCollection,
  saveCollection
} = require("../utils/dataStore");
const {
  deletePuppyImage,
  getImageStorageStatus,
  savePuppyImage
} = require("../utils/imageStorage");
const { hashPassword, verifyPassword } = require("../utils/passwords");

function clean(value) {
  return String(value || "").trim();
}

function normalizeUsername(value) {
  return clean(value).toLowerCase();
}

function normalizeStatus(value) {
  return clean(value).toLowerCase();
}

function isPending(value) {
  return normalizeStatus(value) === "pending";
}

function isApproved(value) {
  return normalizeStatus(value) === "approved";
}

function isSold(value) {
  return normalizeStatus(value) === "sold";
}

function byCreatedDesc(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function hasInvoice(application, invoices) {
  return invoices.some(invoice => invoice.applicationId === application.id);
}

function isInvoiceOverdue(invoice) {
  if (invoice.paid || !invoice.dueDate) return false;
  const due = new Date(invoice.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(23, 59, 59, 999);
  return due < new Date();
}

function buildDashboard({
  applications,
  invoices,
  puppies,
  settings,
  imageStorageStatus,
  storageStatus,
  testimonials
}) {
  const pendingApplications = applications.filter(app => isPending(app.status));
  const approvedWithoutInvoice = applications.filter(
    app => isApproved(app.status) && !hasInvoice(app, invoices)
  );
  const pendingTestimonials = testimonials.filter(
    testimonial => testimonial.approved !== true
  );
  const availablePuppies = puppies.filter(
    puppy => normalizeStatus(puppy.status || "Available") === "available"
  );
  const reservedPuppies = puppies.filter(
    puppy => normalizeStatus(puppy.status) === "reserved"
  );
  const soldPuppies = puppies.filter(puppy => isSold(puppy.status));
  const puppiesMissingImages = puppies.filter(
    puppy => !puppy.images || puppy.images.length === 0
  );
  const unpaidInvoices = invoices.filter(invoice => !invoice.paid);
  const overdueInvoices = invoices.filter(isInvoiceOverdue);

  const notifications = [];

  if (storageStatus.mode !== "mongo") {
    notifications.push({
      tone: "urgent",
      title: "Database is not persisting to MongoDB",
      detail:
        storageStatus.mode === "local-fallback"
          ? "The app is using emergency local fallback because MongoDB is unreachable. Data can reset after a Render restart."
          : "The app is using local JSON files. Connect MongoDB before using the site for real buyers.",
      href: "/admin/settings",
      action: "Check settings"
    });
  }

  if (imageStorageStatus.mode !== "cloudinary") {
    notifications.push({
      tone: imageStorageStatus.isProduction ? "urgent" : "warning",
      title: "Cloudinary image storage is not active",
      detail: imageStorageStatus.isProduction
        ? "Production puppy photo uploads are blocked until Cloudinary is configured, so photos cannot disappear after a Render restart."
        : "Local image uploads are fine for testing, but production needs Cloudinary so puppy photos survive restarts.",
      href: "/admin/puppies",
      action: "Review photos"
    });
  }

  if (pendingApplications.length) {
    notifications.push({
      tone: "warning",
      title: `${pendingApplications.length} application${pendingApplications.length === 1 ? "" : "s"} awaiting review`,
      detail: "Review new buyer applications and approve, reject, or keep them pending.",
      href: "/admin/applications",
      action: "Review applications"
    });
  }

  if (approvedWithoutInvoice.length) {
    notifications.push({
      tone: "urgent",
      title: `${approvedWithoutInvoice.length} approved adoption${approvedWithoutInvoice.length === 1 ? "" : "s"} need invoices`,
      detail: "Create invoices so approved buyers can receive their adoption fee note.",
      href: "/admin/invoices/select-application",
      action: "Create invoices"
    });
  }

  if (pendingTestimonials.length) {
    notifications.push({
      tone: "info",
      title: `${pendingTestimonials.length} testimonial${pendingTestimonials.length === 1 ? "" : "s"} awaiting moderation`,
      detail: "Approve strong reviews or remove submissions that do not belong on the site.",
      href: "/admin/testimonials",
      action: "Moderate reviews"
    });
  }

  if (puppiesMissingImages.length) {
    notifications.push({
      tone: "warning",
      title: `${puppiesMissingImages.length} puppy listing${puppiesMissingImages.length === 1 ? "" : "s"} missing photos`,
      detail: "Listings convert better when each puppy has at least one clear cover photo.",
      href: "/admin/puppies",
      action: "Manage puppies"
    });
  }

  if (overdueInvoices.length) {
    notifications.push({
      tone: "urgent",
      title: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? " is" : "s are"} overdue`,
      detail: "Follow up with buyers or update payment status after confirmation.",
      href: "/admin/invoices",
      action: "View invoices"
    });
  }

  if (!settings.contact || !settings.contact.email) {
    notifications.push({
      tone: "info",
      title: "Public contact email is not set",
      detail: "Add a contact email so buyer inquiries have a clear destination.",
      href: "/admin/settings",
      action: "Update settings"
    });
  }

  const recentApplications = applications
    .slice()
    .sort(byCreatedDesc)
    .slice(0, 5)
    .map(application => ({
      ...application,
      puppyName:
        (puppies.find(puppy => puppy.id === application.puppyId) || {}).name ||
        "Unknown Puppy"
    }));

  return {
    invoiceFollowUps: unpaidInvoices.slice().sort(byCreatedDesc).slice(0, 5),
    notifications,
    puppyCareList: puppiesMissingImages.slice(0, 5),
    recentApplications,
    storageStatus,
    stats: {
      applications: applications.length,
      availablePuppies: availablePuppies.length,
      notifications: notifications.length,
      overdueInvoices: overdueInvoices.length,
      pendingApplications: pendingApplications.length,
      pendingTestimonials: pendingTestimonials.length,
      reservedPuppies: reservedPuppies.length,
      soldPuppies: soldPuppies.length,
      unpaidInvoices: unpaidInvoices.length
    }
  };
}

async function loadPuppies() {
  return loadCollection("puppies");
}

async function savePuppies(puppies) {
  await saveCollection("puppies", puppies);
}

function toPuppyPayload(body, existing = {}) {
  return {
    ...existing,
    name: clean(body.name),
    breed: clean(body.breed) || existing.breed || "Pekingese",
    gender: clean(body.gender),
    dob: clean(body.dob),
    color: clean(body.color),
    description: clean(body.description),
    price: body.price !== undefined ? clean(body.price) : existing.price || "",
    currency:
      body.currency !== undefined
        ? clean(body.currency) || "USD"
        : existing.currency || "USD",
    status: clean(body.status) || existing.status || "Available",
    featured: body.featured === "on",
    vetChecked: body.vetChecked === "on",
    vaccinationStatus: clean(body.vaccinationStatus || body.vaccination),
    registrationType: clean(body.registrationType || body.registration),
    registrationNotes: clean(body.registrationNotes),
    sireName: clean(body.sireName),
    damName: clean(body.damName),
    updatedAt: new Date().toISOString()
  };
}

router.get("/login", (req, res) => {
  res.render("admin/login", { error: null });
});

router.post("/login", asyncHandler(async (req, res) => {
  const username = clean(req.body.username);
  const password = String(req.body.password || "");
  const admins = await loadAdmins();
  const admin = admins.find(a => a.username === username && a.active);

  if (!admin || !(await verifyPassword(password, admin))) {
    return res.status(401).render("admin/login", {
      error: "Invalid credentials"
    });
  }

  req.session.admin = {
    id: admin.id,
    username: admin.username,
    role: admin.role
  };

  res.redirect("/admin/dashboard");
}));

router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

router.get("/dashboard", requireAdmin, asyncHandler(async (req, res) => {
  const [applications, invoices, puppies, settings, testimonials] =
    await Promise.all([
      loadCollection("applications"),
      loadCollection("invoices"),
      loadCollection("puppies"),
      loadSiteSettings(),
      loadCollection("testimonials")
    ]);

  res.render("admin/dashboard", {
    admin: req.session.admin,
    ...buildDashboard({
      applications,
      invoices,
      puppies,
      settings,
      imageStorageStatus: getImageStorageStatus(),
      storageStatus: getDataStoreStatus(),
      testimonials
    })
  });
}));

router.get("/settings", requireAdmin, asyncHandler(async (req, res) => {
  const settings = await loadSiteSettings();
  const flash = req.session._flash || null;
  delete req.session._flash;
  res.render("admin/settings", { settings, flash });
}));

router.post("/settings/test-email", requireAdmin, asyncHandler(async (req, res) => {
  const { sendTestEmail } = require("../utils/emailService");
  const targetEmail = String(req.body.testEmail || "").trim() || process.env.SMTP_USER || "info@imperialpaws.pet";
  const success = await sendTestEmail(targetEmail);
  if (success) {
    req.session._flash = { type: "success", message: `Test verification email sent successfully to ${targetEmail} via mail.spaceship.com!` };
  } else {
    req.session._flash = { type: "danger", message: `Failed to send verification email to ${targetEmail}. Please check that SMTP_USER, SMTP_PASS, and ENABLE_EMAIL_NOTIFICATIONS are set in your .env file.` };
  }
  res.redirect("/admin/settings");
}));

router.post("/settings", requireAdmin, asyncHandler(async (req, res) => {
  const settings = await loadSiteSettings();

  settings.contact = {
    email: clean(req.body.email),
    phone: clean(req.body.phone),
    location: clean(req.body.location)
  };

  settings.socials = {
    facebook: clean(req.body.facebook),
    instagram: clean(req.body.instagram),
    twitter: clean(req.body.twitter),
    tiktok: clean(req.body.tiktok)
  };

  settings.meta = {
    ...settings.meta,
    description:
      Object.prototype.hasOwnProperty.call(req.body, "metaDescription")
        ? clean(req.body.metaDescription)
        : settings.meta.description,
    image:
      Object.prototype.hasOwnProperty.call(req.body, "metaImage")
        ? clean(req.body.metaImage)
        : settings.meta.image,
    keywords:
      Object.prototype.hasOwnProperty.call(req.body, "metaKeywords")
        ? clean(req.body.metaKeywords)
        : settings.meta.keywords,
    siteName:
      Object.prototype.hasOwnProperty.call(req.body, "siteName")
        ? clean(req.body.siteName) || "ImperialPaws Pekingese"
        : settings.meta.siteName,
    siteUrl:
      Object.prototype.hasOwnProperty.call(req.body, "siteUrl")
        ? clean(req.body.siteUrl)
        : settings.meta.siteUrl,
    title:
      Object.prototype.hasOwnProperty.call(req.body, "metaTitle")
        ? clean(req.body.metaTitle) || "ImperialPaws Pekingese"
        : settings.meta.title
  };

  await saveSiteSettings(settings);
  res.redirect("/admin/settings");
}));

router.get("/admins", requireOwner, asyncHandler(async (req, res) => {
  const admins = await loadAdmins();
  res.render("admin/admins", {
    admins,
    error: req.query.error || "",
    success: req.query.success || "",
    values: {
      username: req.query.username || ""
    }
  });
}));

router.post("/admins/add", requireOwner, asyncHandler(async (req, res) => {
  const username = clean(req.body.username);
  const password = String(req.body.password || "");

  const redirectWithError = message => {
    const params = new URLSearchParams({
      error: message,
      username
    });
    return res.redirect(`/admin/admins?${params.toString()}`);
  };

  if (!username || !password) {
    return redirectWithError("Username and password are required.");
  }

  if (password.length < 8) {
    return redirectWithError("Password must be at least 8 characters.");
  }

  const admins = await loadAdmins();
  if (admins.some(a => normalizeUsername(a.username) === normalizeUsername(username))) {
    return redirectWithError("An admin with that username already exists.");
  }

  admins.push({
    id: "admin-" + Date.now(),
    username,
    passwordHash: await hashPassword(password),
    role: "admin",
    active: true,
    createdAt: new Date().toISOString()
  });

  await saveAdmins(admins);
  res.redirect("/admin/admins?success=Admin%20account%20created.");
}));

router.post("/admins/:id/delete", requireOwner, asyncHandler(async (req, res) => {
  const admins = await loadAdmins();
  const adminToDelete = admins.find(a => a.id === req.params.id);

  if (!adminToDelete || adminToDelete.role === "owner") {
    return res.redirect("/admin/admins");
  }

  await saveAdmins(admins.filter(a => a.id !== req.params.id));
  res.redirect("/admin/admins?success=Admin%20account%20removed.");
}));

router.post("/admins/:id/password", requireOwner, asyncHandler(async (req, res) => {
  const password = String(req.body.password || "");
  if (password.length < 8) {
    return res.redirect("/admin/admins?error=Password%20must%20be%20at%20least%208%20characters.");
  }

  const admins = await loadAdmins();
  const admin = admins.find(a => a.id === req.params.id);

  if (admin) {
    admin.passwordHash = await hashPassword(password);
    delete admin.password;
    admin.updatedAt = new Date().toISOString();
    await saveAdmins(admins);
  }

  res.redirect("/admin/admins?success=Password%20updated.");
}));

router.get("/puppies", requireAdmin, asyncHandler(async (req, res) => {
  const puppies = await loadPuppies();
  res.render("admin/puppies/index", { puppies });
}));

router.get("/puppies/add", requireAdmin, (req, res) => {
  res.render("admin/puppies/add");
});

router.post("/puppies/add", requireAdmin, asyncHandler(async (req, res) => {
  const puppies = await loadPuppies();
  const puppy = {
    id: "puppy-" + Date.now(),
    ...toPuppyPayload(req.body),
    createdAt: new Date().toISOString(),
    images: []
  };

  puppies.push(puppy);
  await savePuppies(puppies);
  res.redirect("/admin/puppies");
}));

router.get("/puppies/edit", requireAdmin, asyncHandler(async (req, res) => {
  const puppy = (await loadPuppies()).find(p => p.id === req.query.id);
  if (!puppy) return res.redirect("/admin/puppies");
  res.render("admin/puppies/edit", { puppy });
}));

router.post("/puppies/edit/:id", requireAdmin, asyncHandler(async (req, res) => {
  const puppies = await loadPuppies();
  const index = puppies.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.redirect("/admin/puppies");

  puppies[index] = toPuppyPayload(req.body, puppies[index]);
  await savePuppies(puppies);
  res.redirect("/admin/puppies");
}));

router.post("/puppies/delete", requireAdmin, asyncHandler(async (req, res) => {
  const puppies = await loadPuppies();
  const puppy = puppies.find(p => p.id === req.body.id);

  if (puppy && puppy.images) {
    await Promise.all(puppy.images.map(image => deletePuppyImage(image)));
  }

  await savePuppies(puppies.filter(p => p.id !== req.body.id));
  res.redirect("/admin/puppies");
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed."));
    }
    cb(null, true);
  }
});

router.post(
  "/puppies/images/upload",
  requireAdmin,
  upload.array("images", 12),
  asyncHandler(async (req, res) => {
    const puppies = await loadPuppies();
    const puppy = puppies.find(p => p.id === req.body.puppyId);
    const files = req.files || [];

    if (!puppy || !files.length) return res.redirect("/admin/puppies");

    puppy.images = puppy.images || [];
    const shouldSetRequestedCover = req.body.isCover === "on";

    if (shouldSetRequestedCover || puppy.images.length === 0) {
      puppy.images.forEach(image => {
        image.isCover = false;
      });
    }

    for (let index = 0; index < files.length; index += 1) {
      const imageId = `img-${Date.now()}-${index}`;
      const storedImage = await savePuppyImage(files[index], {
        puppyId: puppy.id,
        imageId
      });

      puppy.images.push({
        id: imageId,
        ...storedImage,
        isCover:
          (shouldSetRequestedCover && index === 0) ||
          (!shouldSetRequestedCover && puppy.images.length === 0)
      });
    }

    await savePuppies(puppies);
    res.redirect(`/admin/puppies/images?id=${encodeURIComponent(puppy.id)}`);
  })
);

router.get("/puppies/images", requireAdmin, asyncHandler(async (req, res) => {
  const puppy = (await loadPuppies()).find(p => p.id === req.query.id);
  if (!puppy) return res.redirect("/admin/puppies");
  puppy.images = puppy.images || [];
  res.render("admin/puppies/images", { puppy });
}));

router.post("/puppies/images/delete", requireAdmin, asyncHandler(async (req, res) => {
  const puppies = await loadPuppies();
  const puppy = puppies.find(p => p.id === req.body.puppyId);
  if (!puppy) return res.redirect("/admin/puppies");

  puppy.images = puppy.images || [];
  const image = puppy.images.find(img => img.id === req.body.imageId);

  if (image) await deletePuppyImage(image);

  puppy.images = puppy.images.filter(img => img.id !== req.body.imageId);

  if (puppy.images.length && !puppy.images.some(img => img.isCover)) {
    puppy.images[0].isCover = true;
  }

  await savePuppies(puppies);
  res.redirect(`/admin/puppies/images?id=${encodeURIComponent(puppy.id)}`);
}));

module.exports = router;
