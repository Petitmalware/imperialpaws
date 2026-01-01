const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const { requireAdmin, requireOwner } = require("./admin-auth");
const { loadAdmins, saveAdmins } = require("../utils/adminStore");
const { loadSiteSettings, saveSiteSettings } = require("../utils/siteSettings");

/* ======================
   HELPERS
====================== */

const DATA_FILE = path.join(__dirname, "../data/puppies.json");

function loadPuppies() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function savePuppies(puppies) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(puppies, null, 2));
}

/* ======================
   AUTH
====================== */

router.get("/login", (req, res) => {
  res.render("admin/login", { error: null });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const admins = loadAdmins();

  const admin = admins.find(
    a => a.username === username && a.password === password && a.active
  );

  if (!admin) {
    return res.render("admin/login", { error: "Invalid credentials" });
  }

  req.session.admin = {
    id: admin.id,
    username: admin.username,
    role: admin.role
  };

  res.redirect("/admin/dashboard");
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ======================
   DASHBOARD (FIXED)
====================== */

router.get("/dashboard", requireAdmin, (req, res) => {
  res.render("admin/dashboard", {
    admin: req.session.admin
  });
});

/* ======================
   SITE SETTINGS
====================== */

router.get("/settings", requireAdmin, (req, res) => {
  const settings = loadSiteSettings();
  res.render("admin/settings", { settings });
});

router.post("/settings", requireAdmin, (req, res) => {
  const settings = loadSiteSettings();

  settings.contact = {
    email: req.body.email || "",
    phone: req.body.phone || "",
    location: req.body.location || ""
  };

  settings.socials = {
    facebook: req.body.facebook || "",
    instagram: req.body.instagram || "",
    twitter: req.body.twitter || "",
    tiktok: req.body.tiktok || ""
  };

  saveSiteSettings(settings);
  res.redirect("/admin/settings");
});

/* ======================
   ADMIN MANAGEMENT
====================== */

router.get("/admins", requireOwner, (req, res) => {
  const admins = loadAdmins();
  res.render("admin/admins", { admins });
});

router.post("/admins/add", requireOwner, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.redirect("/admin/admins");

  const admins = loadAdmins();
  if (admins.find(a => a.username === username)) {
    return res.redirect("/admin/admins");
  }

  admins.push({
    id: "admin-" + Date.now(),
    username,
    password,
    role: "admin",
    active: true,
    createdAt: new Date().toISOString()
  });

  saveAdmins(admins);
  res.redirect("/admin/admins");
});

router.post("/admins/:id/delete", requireOwner, (req, res) => {
  const admins = loadAdmins().filter(a => a.id !== req.params.id);
  saveAdmins(admins);
  res.redirect("/admin/admins");
});

/* ======================
   PUPPIES
====================== */

router.get("/puppies", requireAdmin, (req, res) => {
  const puppies = loadPuppies();
  res.render("admin/puppies/index", { puppies });
});

router.get("/puppies/add", requireAdmin, (req, res) => {
  res.render("admin/puppies/add");
});

router.post("/puppies/add", requireAdmin, (req, res) => {
  const puppies = loadPuppies();

  puppies.push({
    id: "puppy-" + Date.now(),
    name: req.body.name,
    gender: req.body.gender,
    dob: req.body.dob,
    color: req.body.color,
    description: req.body.description,
    price: req.body.price,
    currency: req.body.currency || "USD",
    status: req.body.status || "Available",
    featured: req.body.featured === "on",
    vetChecked: req.body.vetChecked === "on",
    createdAt: new Date().toISOString(),
    images: []
  });

  savePuppies(puppies);
  res.redirect("/admin/puppies");
});

router.get("/puppies/edit", requireAdmin, (req, res) => {
  const puppy = loadPuppies().find(p => p.id === req.query.id);
  if (!puppy) return res.redirect("/admin/puppies");
  res.render("admin/puppies/edit", { puppy });
});

router.post("/puppies/edit/:id", requireAdmin, (req, res) => {
  const puppies = loadPuppies();
  const index = puppies.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.redirect("/admin/puppies");

  puppies[index] = { ...puppies[index], ...req.body };
  savePuppies(puppies);
  res.redirect("/admin/puppies");
});

router.post("/puppies/delete", requireAdmin, (req, res) => {
  savePuppies(loadPuppies().filter(p => p.id !== req.body.id));
  res.redirect("/admin/puppies");
});

/* ======================
   IMAGE UPLOAD (SINGLE)
====================== */

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(
      __dirname,
      "../../public/uploads/puppies",
      req.body.puppyId
    );
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

router.post(
  "/puppies/images/upload",
  requireAdmin,
  upload.single("image"),
  (req, res) => {
    const puppies = loadPuppies();
    const puppy = puppies.find(p => p.id === req.body.puppyId);
    if (!puppy) return res.redirect("/admin/puppies");

    puppy.images = puppy.images || [];
    if (req.body.isCover === "on") {
      puppy.images.forEach(i => (i.isCover = false));
    }

    puppy.images.push({
      id: "img-" + Date.now(),
      path: `/uploads/puppies/${req.body.puppyId}/${req.file.filename}`,
      isCover: req.body.isCover === "on"
    });

    savePuppies(puppies);
    res.redirect("/admin/puppies/images?id=" + req.body.puppyId);
  }
);

router.get("/puppies/images", requireAdmin, (req, res) => {
  const puppy = loadPuppies().find(p => p.id === req.query.id);
  if (!puppy) return res.redirect("/admin/puppies");
  puppy.images = puppy.images || [];
  res.render("admin/puppies/images", { puppy });
});

router.post("/puppies/images/delete", requireAdmin, (req, res) => {
  const puppies = loadPuppies();
  const puppy = puppies.find(p => p.id === req.body.puppyId);
  if (!puppy) return res.redirect("/admin/puppies");

  puppy.images = puppy.images.filter(img => img.id !== req.body.imageId);
  savePuppies(puppies);
  res.redirect("/admin/puppies/images?id=" + req.body.puppyId);
});

module.exports = router;
