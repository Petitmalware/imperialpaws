const express = require("express");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const expressLayouts = require("express-ejs-layouts");

const { loadSiteSettings } = require("./utils/siteSettings");
const applicantInvoiceRoutes = require("./routes/applicant-invoice");

/* ======================
   CREATE APP
====================== */
const app = express();
const PORT = 3000;

/* ======================
   VIEW ENGINE
====================== */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

/* ======================
   GLOBAL MIDDLEWARE
====================== */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

/* Make site settings available everywhere */
app.use((req, res, next) => {
  res.locals.siteSettings = loadSiteSettings();
  next();
});

/* ======================
   SESSION (BEFORE ADMIN)
====================== */
app.use(
  session({
    secret: "imperialpaws-secret",
    resave: false,
    saveUninitialized: false
  })
);

/* ======================
   STATIC FILES
====================== */
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));
app.use(express.static(path.join(__dirname, "../public")));



app.use(applicantInvoiceRoutes);


/* ======================
   ROUTE IMPORTS (DECLARE FIRST)
====================== */
const adminRoutes = require("./admin/admin-routes");
const adminApplicationsRoutes = require("./admin/admin-applications");
const adminTestimonialsRoutes = require("./admin/admin-testimonials");
const adminInvoicesRoutes = require("./admin/admin-invoices");
const trackRoutes = require("./routes/track");

/* ======================
   ROUTE MOUNTS (USE SECOND)
====================== */
app.use("/admin", adminRoutes);
app.use("/admin", adminApplicationsRoutes);
app.use("/admin", adminTestimonialsRoutes);
app.use("/admin", adminInvoicesRoutes);
app.use(trackRoutes);

/* ======================
   DATA HELPERS
====================== */
function loadJSON(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const PUPPIES_FILE = path.join(__dirname, "data/puppies.json");
const APPLICATIONS_FILE = path.join(__dirname, "data/applications.json");
const TESTIMONIALS_FILE = path.join(__dirname, "data/testimonials.json");

const loadPuppies = () => loadJSON(PUPPIES_FILE);
const loadApplications = () => loadJSON(APPLICATIONS_FILE);
const saveApplications = data => saveJSON(APPLICATIONS_FILE, data);
const loadTestimonials = () => loadJSON(TESTIMONIALS_FILE);
const saveTestimonials = data => saveJSON(TESTIMONIALS_FILE, data);

function generateTrackingCode() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `IP-PUPPY-${year}${month}-${random}`;
}

/* ======================
   VISITOR ROUTES
====================== */

// HOME
app.get("/", (req, res) => {
  const puppies = loadPuppies();

  const featuredPuppies = puppies
    .filter(p => p.featured === true && p.status !== "Sold")
    .slice(0, 6);

  const testimonials = loadTestimonials()
    .filter(t => t.approved === true)
    .slice(0, 3);

  res.render("home/index", {
    featuredPuppies,
    testimonials,
    page: "home"
  });
});

// TESTIMONIALS (VISITOR PAGE)
app.get("/testimonials", (req, res) => {
  const testimonials = loadTestimonials().filter(t =>
    t.approved === true ||
    (t.status && t.status.toLowerCase() === "approved")
  );

  res.render("home/testimonials", { testimonials });
});











// TESTIMONIALS PAGE (PUBLIC)
app.get("/testimonials", (req, res) => {
  const testimonials = loadTestimonials().filter(
    t => t.status === "approved"
  );

  res.render("home/testimonials", { testimonials });
});





/* STATIC PAGES */
app.get("/about", (req, res) => res.render("home/about"));
app.get("/adoption-process", (req, res) => res.render("home/adoption-process"));
app.get("/faq", (req, res) => res.render("home/faq"));
app.get("/contact", (req, res) => res.render("home/contact"));

/* PUPPIES LIST */
app.get("/puppies", (req, res) => {
  res.render("home/puppies", { puppies: loadPuppies() });
});

/* PUPPY DETAILS */
app.get("/puppies/:id", (req, res) => {
  const puppy = loadPuppies().find(p => p.id === req.params.id);
  if (!puppy) return res.status(404).send("Puppy not found");

  let alreadyApplied = false;
  const fromTracking = req.query.fromTracking === "true";

  if (req.cookies.imperialpaws_application) {
    try {
      const saved = JSON.parse(req.cookies.imperialpaws_application);
      if (saved.puppyId === puppy.id) alreadyApplied = true;
    } catch {}
  }

  res.render("home/puppy-details", {
    puppy,
    alreadyApplied,
    fromTracking
  });
});

/* APPLY */
app.get("/apply/:puppyId", (req, res) => {
  const puppy = loadPuppies().find(p => p.id === req.params.puppyId);
  if (!puppy) return res.status(404).send("Puppy not found");

  res.render("home/apply", { puppy });
});

app.post("/apply", (req, res) => {
  const applications = loadApplications();
  const { puppyId, email } = req.body;

  if (applications.find(a => a.puppyId === puppyId && a.email === email)) {
    return res.send("Duplicate application detected.");
  }

  const trackingCode = generateTrackingCode(puppyId);

  applications.push({
    id: trackingCode,
    ...req.body,
    status: "Pending",
    createdAt: new Date().toISOString()
  });

  saveApplications(applications);

  res.cookie(
    "imperialpaws_application",
    JSON.stringify({ puppyId, trackingCode }),
    { maxAge: 31536000000, httpOnly: true }
  );

  res.redirect("/apply/confirmation/" + trackingCode);
});

app.get("/apply/confirmation/:code", (req, res) => {
  res.render("home/apply-confirmation", {
    trackingCode: req.params.code
  });
});

/* TRACK */
app.get("/track", (req, res) => res.render("home/track", { error: null }));

app.get("/track/result", (req, res) => {
  const application = loadApplications().find(a => a.id === req.query.code);
  if (!application) {
    return res.render("home/track", { error: "Invalid tracking code." });
  }

  const puppy = loadPuppies().find(p => p.id === application.puppyId);
  res.render("home/track-result", { application, puppy });
});

/* TESTIMONIAL SUBMISSION */
app.get("/testimonials/submit", (req, res) => {
  res.render("home/testimonial-submit", { error: null });
});

app.post("/testimonials/submit", (req, res) => {
  const { name, email, message, location } = req.body;
  if (!name || !email || !message) {
    return res.render("home/testimonial-submit", {
      error: "Name, email, and message are required."
    });
  }

  const testimonials = loadTestimonials();
testimonials.push({
  id: "test-" + Date.now(),
  name,
  email,
  location: location || "",
  message,
  status: "pending",
  featured: false,
  createdAt: new Date().toISOString()
});

  saveTestimonials(testimonials);
  res.render("home/testimonial-thankyou");
});

/* ======================
   START SERVER
====================== */
app.listen(PORT, () => {
  console.log(`ImperialPaws running at http://localhost:${PORT}`);
});