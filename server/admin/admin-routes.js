const express = require("express");
const router = express.Router();
const multer = require("multer");

const asyncHandler = require("../utils/asyncHandler");
const { requireAdmin, requireOwner } = require("./admin-auth");
const { loadAdmins, saveAdmins } = require("../utils/adminStore");
const { loadSiteSettings, saveSiteSettings } = require("../utils/siteSettings");
const { loadCollection, saveCollection } = require("../utils/dataStore");
const { deletePuppyImage, savePuppyImage } = require("../utils/imageStorage");
const { hashPassword, verifyPassword } = require("../utils/passwords");

function clean(value) {
  return String(value || "").trim();
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

router.get("/dashboard", requireAdmin, (req, res) => {
  res.render("admin/dashboard", {
    admin: req.session.admin
  });
});

router.get("/settings", requireAdmin, asyncHandler(async (req, res) => {
  const settings = await loadSiteSettings();
  res.render("admin/settings", { settings });
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

  await saveSiteSettings(settings);
  res.redirect("/admin/settings");
}));

router.get("/admins", requireOwner, asyncHandler(async (req, res) => {
  const admins = await loadAdmins();
  res.render("admin/admins", { admins });
}));

router.post("/admins/add", requireOwner, asyncHandler(async (req, res) => {
  const username = clean(req.body.username);
  const password = String(req.body.password || "");
  if (!username || !password) return res.redirect("/admin/admins");

  const admins = await loadAdmins();
  if (admins.some(a => a.username === username)) {
    return res.redirect("/admin/admins");
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
  res.redirect("/admin/admins");
}));

router.post("/admins/:id/delete", requireOwner, asyncHandler(async (req, res) => {
  const admins = await loadAdmins();
  const adminToDelete = admins.find(a => a.id === req.params.id);

  if (!adminToDelete || adminToDelete.role === "owner") {
    return res.redirect("/admin/admins");
  }

  await saveAdmins(admins.filter(a => a.id !== req.params.id));
  res.redirect("/admin/admins");
}));

router.post("/admins/:id/password", requireOwner, asyncHandler(async (req, res) => {
  const password = String(req.body.password || "");
  if (password.length < 8) return res.redirect("/admin/admins");

  const admins = await loadAdmins();
  const admin = admins.find(a => a.id === req.params.id);

  if (admin) {
    admin.passwordHash = await hashPassword(password);
    delete admin.password;
    admin.updatedAt = new Date().toISOString();
    await saveAdmins(admins);
  }

  res.redirect("/admin/admins");
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
  upload.single("image"),
  asyncHandler(async (req, res) => {
    const puppies = await loadPuppies();
    const puppy = puppies.find(p => p.id === req.body.puppyId);

    if (!puppy || !req.file) return res.redirect("/admin/puppies");

    puppy.images = puppy.images || [];
    const imageId = "img-" + Date.now();
    const shouldBeCover =
      req.body.isCover === "on" || puppy.images.length === 0;
    const storedImage = await savePuppyImage(req.file, {
      puppyId: puppy.id,
      imageId
    });

    if (shouldBeCover) {
      puppy.images.forEach(image => {
        image.isCover = false;
      });
    }

    puppy.images.push({
      id: imageId,
      ...storedImage,
      isCover: shouldBeCover
    });

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
