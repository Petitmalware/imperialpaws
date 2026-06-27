const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const expressLayouts = require("express-ejs-layouts");

const { loadSiteSettings } = require("./utils/siteSettings");
const { createTestimonial } = require("./utils/testimonialStore");
const { getCurrencySymbol } = require("./utils/currency");
const { loadCollection, saveCollection } = require("./utils/dataStore");
const asyncHandler = require("./utils/asyncHandler");
const applicantInvoiceRoutes = require("./routes/applicant-invoice");
const adminRoutes = require("./admin/admin-routes");
const adminApplicationsRoutes = require("./admin/admin-applications");
const adminTestimonialsRoutes = require("./admin/admin-testimonials");
const adminInvoicesRoutes = require("./admin/admin-invoices");
const trackRoutes = require("./routes/track");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "imperialpaws-dev-secret";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(asyncHandler(async (req, res, next) => {
  res.locals.siteSettings = await loadSiteSettings();
  res.locals.currencySymbol = getCurrencySymbol;
  res.locals.absoluteUrl = urlPath =>
    `${req.protocol}://${req.get("host")}${urlPath}`;
  res.locals.statusClass = value =>
    String(value || "unknown").trim().toLowerCase().replace(/\s+/g, "-");
  next();
}));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
    }
  })
);

app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));
app.use(express.static(path.join(__dirname, "../public")));

app.use(applicantInvoiceRoutes);
app.use("/admin", adminRoutes);
app.use("/admin", adminApplicationsRoutes);
app.use("/admin", adminTestimonialsRoutes);
app.use("/admin", adminInvoicesRoutes);
app.use(trackRoutes);

const loadPuppies = () => loadCollection("puppies");
const loadApplications = () => loadCollection("applications");
const saveApplications = data => saveCollection("applications", data);
const loadTestimonials = () => loadCollection("testimonials");
const saveTestimonials = data => saveCollection("testimonials", data);

function isApprovedTestimonial(testimonial) {
  return (
    testimonial.approved === true ||
    String(testimonial.status || "").toLowerCase() === "approved"
  );
}

function isSold(puppy) {
  return String(puppy.status || "").toLowerCase() === "sold";
}

function generateTrackingCode(applications) {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");

  for (let i = 0; i < 20; i += 1) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const code = `IP-PUPPY-${year}${month}-${random}`;
    if (!applications.some(application => application.id === code)) {
      return code;
    }
  }

  return `IP-PUPPY-${year}${month}-${Date.now()}`;
}

app.get("/", asyncHandler(async (req, res) => {
  const puppies = await loadPuppies();

  const featuredPuppies = puppies
    .filter(puppy => puppy.featured === true && !isSold(puppy))
    .slice(0, 6);

  const testimonials = (await loadTestimonials())
    .filter(isApprovedTestimonial)
    .slice(0, 3);

  res.render("home/index", {
    featuredPuppies,
    testimonials,
    page: "home"
  });
}));

app.get("/testimonials", asyncHandler(async (req, res) => {
  const testimonials = (await loadTestimonials()).filter(isApprovedTestimonial);
  res.render("home/testimonials", { testimonials });
}));

app.get("/about", (req, res) => res.render("home/about"));
app.get("/adoption-process", (req, res) => res.render("home/adoption-process"));
app.get("/faq", (req, res) => res.render("home/faq"));
app.get("/contact", (req, res) => res.render("home/contact"));

app.get("/puppies", asyncHandler(async (req, res) => {
  res.render("home/puppies", { puppies: await loadPuppies() });
}));

app.get("/puppies/:id", asyncHandler(async (req, res) => {
  const puppy = (await loadPuppies()).find(p => p.id === req.params.id);
  if (!puppy) return res.status(404).send("Puppy not found");

  let alreadyApplied = false;
  const fromTracking = req.query.fromTracking === "true";

  if (req.cookies.imperialpaws_application) {
    try {
      const saved = JSON.parse(req.cookies.imperialpaws_application);
      alreadyApplied = saved.puppyId === puppy.id;
    } catch (err) {
      res.clearCookie("imperialpaws_application");
    }
  }

  res.render("home/puppy-details", {
    puppy,
    alreadyApplied,
    fromTracking
  });
}));

app.get("/apply/:puppyId", asyncHandler(async (req, res) => {
  const puppy = (await loadPuppies()).find(p => p.id === req.params.puppyId);
  if (!puppy) return res.status(404).send("Puppy not found");

  res.render("home/apply", { puppy, error: null, values: {} });
}));

app.post("/apply", asyncHandler(async (req, res) => {
  const applications = await loadApplications();
  const puppies = await loadPuppies();
  const puppy = puppies.find(p => p.id === req.body.puppyId);

  if (!puppy) return res.status(404).send("Puppy not found");

  const values = {
    name: String(req.body.name || "").trim(),
    email: String(req.body.email || "").trim(),
    phone: String(req.body.phone || "").trim(),
    location: String(req.body.location || "").trim(),
    message: String(req.body.message || "").trim()
  };

  if (!values.name || !values.email || !values.phone || !values.location) {
    return res.status(400).render("home/apply", {
      puppy,
      error: "Please complete the required fields.",
      values
    });
  }

  const duplicate = applications.find(
    application =>
      application.puppyId === puppy.id &&
      String(application.email || "").toLowerCase() === values.email.toLowerCase()
  );

  if (duplicate) {
    res.cookie(
      "imperialpaws_application",
      JSON.stringify({ puppyId: puppy.id, trackingCode: duplicate.id }),
      { maxAge: 31536000000, httpOnly: true, sameSite: "lax" }
    );
    return res.redirect(`/apply/confirmation/${duplicate.id}`);
  }

  const trackingCode = generateTrackingCode(applications);

  applications.push({
    id: trackingCode,
    puppyId: puppy.id,
    ...values,
    status: "Pending",
    createdAt: new Date().toISOString()
  });

  await saveApplications(applications);

  res.cookie(
    "imperialpaws_application",
    JSON.stringify({ puppyId: puppy.id, trackingCode }),
    { maxAge: 31536000000, httpOnly: true, sameSite: "lax" }
  );

  res.redirect(`/apply/confirmation/${trackingCode}`);
}));

app.get("/apply/confirmation/:code", (req, res) => {
  res.render("home/apply-confirmation", {
    trackingCode: req.params.code
  });
});

app.get("/track", (req, res) => {
  res.render("home/track", {
    error: null,
    code: req.query.code || ""
  });
});

app.get("/testimonials/submit", (req, res) => {
  res.render("home/testimonial-submit", { error: null, values: {} });
});

app.post("/testimonials/submit", asyncHandler(async (req, res) => {
  const values = {
    name: String(req.body.name || "").trim(),
    email: String(req.body.email || "").trim(),
    location: String(req.body.location || "").trim(),
    message: String(req.body.message || "").trim()
  };

  if (!values.name || !values.email || !values.message) {
    return res.status(400).render("home/testimonial-submit", {
      error: "Name, email, and message are required.",
      values
    });
  }

  const testimonials = await loadTestimonials();
  testimonials.push(createTestimonial(values));
  await saveTestimonials(testimonials);
  res.render("home/testimonial-thankyou");
}));

app.use((req, res) => {
  res.status(404).send("Page not found");
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Something went wrong. Please try again.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ImperialPaws running at http://localhost:${PORT}`);
});
