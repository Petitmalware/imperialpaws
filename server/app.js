const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const expressLayouts = require("express-ejs-layouts");

const { loadSiteSettings } = require("./utils/siteSettings");
const { createTestimonial } = require("./utils/testimonialStore");
const { getCurrencySymbol } = require("./utils/currency");
const { createRateLimiter } = require("./utils/rateLimit");
const {
  describeMongoConfig,
  loadCollection,
  saveCollection
} = require("./utils/dataStore");
const {
  buildBreadcrumbSchema,
  buildFAQSchema,
  buildOrganizationSchema,
  buildPageMeta,
  buildPuppyItemListSchema,
  buildPuppySchema,
  buildWebSiteSchema,
  getBaseUrl,
  toAbsoluteUrl,
  xmlEscape
} = require("./utils/seo");
const asyncHandler = require("./utils/asyncHandler");
const applicantInvoiceRoutes = require("./routes/applicant-invoice");
const adminRoutes = require("./admin/admin-routes");
const adminApplicationsRoutes = require("./admin/admin-applications");
const adminTestimonialsRoutes = require("./admin/admin-testimonials");
const adminInvoicesRoutes = require("./admin/admin-invoices");
const trackRoutes = require("./routes/track");
const adminContractsRoutes = require("./admin/admin-contracts");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "imperialpaws-dev-secret";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const STATIC_MAX_AGE = process.env.NODE_ENV === "production" ? "7d" : 0;

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(expressLayouts);
app.set("layout", "layouts/main");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (IS_PRODUCTION) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

app.get("/healthz", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../public/uploads"), {
    etag: true,
    maxAge: STATIC_MAX_AGE
  })
);
app.use(express.static(path.join(__dirname, "../public"), {
  etag: true,
  maxAge: STATIC_MAX_AGE
}));

app.use(asyncHandler(async (req, res, next) => {
  const siteSettings = await loadSiteSettings();
  const baseUrl = getBaseUrl(req, siteSettings);
  const baseJsonLd = [
    buildOrganizationSchema(siteSettings, baseUrl),
    buildWebSiteSchema(siteSettings, baseUrl)
  ];

  res.locals.currentPath = req.path;
  res.locals.isAdminPage = req.path.startsWith("/admin");
  res.locals.siteSettings = siteSettings;
  res.locals.currencySymbol = getCurrencySymbol;
  res.locals.absoluteUrl = urlPath => toAbsoluteUrl(urlPath, baseUrl);
  res.locals.buildPageMeta = overrides =>
    buildPageMeta(req, siteSettings, overrides);
  res.locals.buildJsonLd = (...items) =>
    baseJsonLd.concat(items.flat().filter(Boolean));
  res.locals.pageMeta = buildPageMeta(req, siteSettings);
  res.locals.jsonLd = baseJsonLd;
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
      maxAge: 1000 * 60 * 60 * 8,
      sameSite: "lax",
      secure: IS_PRODUCTION
    }
  })
);

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  message: "Too many login attempts. Please wait a few minutes and try again."
});
const publicFormRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: "Too many form submissions. Please wait a few minutes and try again."
});

app.post("/admin/login", loginRateLimiter);
app.post("/apply", publicFormRateLimiter);
app.post("/testimonials/submit", publicFormRateLimiter);

app.use((req, res, next) => {
  res.locals.adminUser = req.session && req.session.admin
    ? req.session.admin
    : null;
  next();
});

app.get("/robots.txt", (req, res) => {
  const sitemapUrl = res.locals.absoluteUrl("/sitemap.xml");
  res.type("text/plain").send(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin/",
      "Disallow: /apply/confirmation/",
      "Disallow: /track/result",
      "",
      `Sitemap: ${sitemapUrl}`
    ].join("\n")
  );
});

app.get("/sitemap.xml", asyncHandler(async (req, res) => {
  const puppies = await loadPuppies();
  const staticPages = [
    "/",
    "/puppies",
    "/about",
    "/adoption-process",
    "/faq",
    "/testimonials",
    "/contact",
    "/privacy-policy",
    "/terms"
  ];
  const urls = staticPages.concat(
    puppies
      .filter(puppy => !isSold(puppy))
      .map(puppy => `/puppies/${encodeURIComponent(puppy.id)}`)
  );

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(urlPath => {
        const priority = urlPath === "/" ? "1.0" : urlPath.startsWith("/puppies/") ? "0.8" : "0.7";
        return [
          "  <url>",
          `    <loc>${xmlEscape(res.locals.absoluteUrl(urlPath))}</loc>`,
          `    <changefreq>${urlPath.startsWith("/puppies") ? "daily" : "weekly"}</changefreq>`,
          `    <priority>${priority}</priority>`,
          "  </url>"
        ].join("\n");
      })
      .join("\n") +
    "\n</urlset>\n";

  res.type("application/xml").send(body);
}));

app.use(applicantInvoiceRoutes);
app.use("/admin", adminRoutes);
app.use("/admin", adminApplicationsRoutes);
app.use("/admin", adminTestimonialsRoutes);
app.use("/admin", adminInvoicesRoutes);
app.use("/admin", adminContractsRoutes);
app.use(trackRoutes);

const loadPuppies = () => loadCollection("puppies", { fallbackToLocal: true });
const loadApplications = () => loadCollection("applications");
const saveApplications = data => saveCollection("applications", data);
const loadTestimonials = () =>
  loadCollection("testimonials", { fallbackToLocal: true });
const saveTestimonials = data => saveCollection("testimonials", data);

const FAQ_ITEMS = [
  {
    question: "Why do you require an adoption application?",
    answer:
      "The adoption application helps ImperialPaws review each family carefully so every Pekingese puppy is placed into a safe, prepared, and committed home."
  },
  {
    question: "Does submitting an application guarantee approval?",
    answer:
      "No. Every application is reviewed individually, and placement decisions are made in the best interest of the puppy."
  },
  {
    question: "How can I check the status of my application?",
    answer:
      "After submitting an application, buyers receive a unique tracking code that can be used on the website to check application status."
  },
  {
    question: "When are payments requested?",
    answer:
      "Payments are not requested through the public website before an application is reviewed and approved. Approved buyers receive a clear adoption invoice."
  },
  {
    question: "Do you accept more than one application per puppy?",
    answer:
      "To maintain fairness and clarity, the website prevents the same buyer from submitting repeated applications for the same puppy when the same email address or phone number is used."
  },
  {
    question: "Are your puppies vaccinated and vet checked?",
    answer:
      "Puppies receive age-appropriate veterinary care and monitoring. Specific health details are listed on each puppy detail page when available."
  },
  {
    question: "Do you offer delivery or transportation?",
    answer:
      "Transportation options may vary depending on location and circumstances. Available options are discussed with approved applicants."
  },
  {
    question: "Can I visit the puppies in person?",
    answer:
      "Visit options, if available, are discussed during the adoption process and may depend on timing, location, and the puppy's age."
  },
  {
    question: "Who can I contact if I have additional questions?",
    answer:
      "If your question is not answered on the website, you may reach out through the contact page when public contact information is available."
  },
  {
    question: "Do you serve families in the United States?",
    answer:
      "ImperialPaws Pekingese is built for families in the United States and focuses on responsible placement, clear communication, and appropriate next steps for approved homes."
  }
];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function sameBuyerApplication(application, puppyId, values) {
  if (application.puppyId !== puppyId) return false;

  const existingEmail = normalizeEmail(application.email);
  const nextEmail = normalizeEmail(values.email);
  if (existingEmail && nextEmail && existingEmail === nextEmail) return true;

  const existingPhone = normalizePhone(application.phone);
  const nextPhone = normalizePhone(values.phone);
  return Boolean(existingPhone && nextPhone && existingPhone === nextPhone);
}

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
    jsonLd: res.locals.buildJsonLd(
      buildBreadcrumbSchema(res.locals.pageMeta.baseUrl, [
        { name: "Home", url: "/" }
      ])
    ),
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: "/",
      description:
        "ImperialPaws Pekingese is a responsible Pekingese breeder serving families across the United States with home-raised puppies, application review, status tracking, and clear adoption invoices.",
      title: "Responsible Pekingese Breeder in the USA"
    }),
    testimonials,
    page: "home"
  });
}));

app.get("/testimonials", asyncHandler(async (req, res) => {
  const testimonials = (await loadTestimonials()).filter(isApprovedTestimonial);
  res.render("home/testimonials", {
    jsonLd: res.locals.buildJsonLd(
      buildBreadcrumbSchema(res.locals.pageMeta.baseUrl, [
        { name: "Home", url: "/" },
        { name: "Testimonials", url: "/testimonials" }
      ])
    ),
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: "/testimonials",
      description:
        "Read experiences from ImperialPaws Pekingese families and learn how our responsible adoption process supports thoughtful puppy placement.",
      title: "Pekingese Puppy Family Testimonials"
    }),
    testimonials
  });
}));

app.get("/about", (req, res) => res.render("home/about", {
  jsonLd: res.locals.buildJsonLd(
    buildBreadcrumbSchema(res.locals.pageMeta.baseUrl, [
      { name: "Home", url: "/" },
      { name: "About", url: "/about" }
    ])
  ),
  pageMeta: res.locals.buildPageMeta({
    canonicalPath: "/about",
    description:
      "Learn about ImperialPaws Pekingese, an ethical home-based Pekingese breeding program focused on health, temperament, transparency, and long-term placement.",
    title: "About Our Pekingese Breeding Program"
  })
}));
app.get("/adoption-process", (req, res) => res.render("home/adoption-process", {
  jsonLd: res.locals.buildJsonLd(
    buildBreadcrumbSchema(res.locals.pageMeta.baseUrl, [
      { name: "Home", url: "/" },
      { name: "Adoption Process", url: "/adoption-process" }
    ])
  ),
  pageMeta: res.locals.buildPageMeta({
    canonicalPath: "/adoption-process",
    description:
      "Review the ImperialPaws Pekingese adoption process, including puppy browsing, application review, tracking, approval, and invoice steps.",
    title: "Pekingese Puppy Adoption Process"
  })
}));
app.get("/faq", (req, res) => res.render("home/faq", {
  faqItems: FAQ_ITEMS,
  jsonLd: res.locals.buildJsonLd(
    buildFAQSchema(FAQ_ITEMS),
    buildBreadcrumbSchema(res.locals.pageMeta.baseUrl, [
      { name: "Home", url: "/" },
      { name: "FAQ", url: "/faq" }
    ])
  ),
  pageMeta: res.locals.buildPageMeta({
    canonicalPath: "/faq",
    description:
      "Find answers about ImperialPaws Pekingese applications, puppy availability, approval, tracking codes, invoices, health care, and placement expectations.",
    title: "Pekingese Puppy Adoption FAQ"
  })
}));
app.get("/contact", (req, res) => res.render("home/contact", {
  jsonLd: res.locals.buildJsonLd(
    buildBreadcrumbSchema(res.locals.pageMeta.baseUrl, [
      { name: "Home", url: "/" },
      { name: "Contact", url: "/contact" }
    ])
  ),
  pageMeta: res.locals.buildPageMeta({
    canonicalPath: "/contact",
    description:
      "Contact ImperialPaws Pekingese for thoughtful questions about available puppies, adoption applications, and responsible Pekingese placement.",
    title: "Contact ImperialPaws Pekingese"
  })
}));
app.get("/privacy-policy", (req, res) => res.render("home/privacy", {
  pageMeta: res.locals.buildPageMeta({
    canonicalPath: "/privacy-policy",
    description:
      "Review the ImperialPaws Pekingese privacy policy for adoption applications, buyer contact details, tracking codes, invoices, and testimonial submissions.",
    title: "Privacy Policy"
  })
}));
app.get("/terms", (req, res) => res.render("home/terms", {
  pageMeta: res.locals.buildPageMeta({
    canonicalPath: "/terms",
    description:
      "Review ImperialPaws Pekingese website terms, adoption application notices, invoice guidance, and responsible placement expectations.",
    title: "Website Terms and Adoption Notices"
  })
}));

app.get("/puppies", asyncHandler(async (req, res) => {
  const puppies = await loadPuppies();
  res.render("home/puppies", {
    jsonLd: res.locals.buildJsonLd(
      buildPuppyItemListSchema(puppies.filter(puppy => !isSold(puppy)), res.locals.pageMeta.baseUrl),
      buildBreadcrumbSchema(res.locals.pageMeta.baseUrl, [
        { name: "Home", url: "/" },
        { name: "Puppies", url: "/puppies" }
      ])
    ),
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: "/puppies",
      description:
        "Browse available ImperialPaws Pekingese puppies raised with care, health monitoring, early socialization, and a responsible application process.",
      title: "Available Pekingese Puppies"
    }),
    puppies
  });
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
    fromTracking,
    jsonLd: res.locals.buildJsonLd(
      buildPuppySchema(puppy, res.locals.pageMeta.baseUrl),
      buildBreadcrumbSchema(res.locals.pageMeta.baseUrl, [
        { name: "Home", url: "/" },
        { name: "Puppies", url: "/puppies" },
        { name: puppy.name, url: `/puppies/${encodeURIComponent(puppy.id)}` }
      ])
    ),
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: `/puppies/${encodeURIComponent(puppy.id)}`,
      description:
        puppy.description ||
        `Meet ${puppy.name}, a home-raised ImperialPaws Pekingese puppy with thoughtful placement through our adoption application process.`,
      image:
        puppy.images && puppy.images.length
          ? (puppy.images.find(image => image.isCover) || puppy.images[0]).path
          : undefined,
      title: `${puppy.name} - Pekingese Puppy Details`
    })
  });
}));

app.get("/apply/:puppyId", asyncHandler(async (req, res) => {
  const puppy = (await loadPuppies()).find(p => p.id === req.params.puppyId);
  if (!puppy) return res.status(404).send("Puppy not found");

  res.render("home/apply", {
    puppy,
    error: null,
    values: {},
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: `/apply/${encodeURIComponent(puppy.id)}`,
      description:
        `Submit an adoption application for ${puppy.name} through the ImperialPaws Pekingese placement process.`,
      robots: "noindex, nofollow",
      title: `Apply for ${puppy.name}`
    })
  });
}));

app.post("/apply", asyncHandler(async (req, res) => {
  const applications = await loadApplications();
  const puppies = await loadPuppies();
  const puppy = puppies.find(p => p.id === req.body.puppyId);

  if (!puppy) return res.status(404).send("Puppy not found");

  if (String(puppy.status || "Available").toLowerCase() !== "available") {
    return res.status(409).render("home/apply", {
      puppy,
      error:
        "This puppy is not currently available for new applications. Please review available puppies or track an existing application.",
      values: req.body,
      pageMeta: res.locals.buildPageMeta({
        canonicalPath: `/apply/${encodeURIComponent(puppy.id)}`,
        robots: "noindex, nofollow",
        title: `Apply for ${puppy.name}`
      })
    });
  }

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
      values,
      pageMeta: res.locals.buildPageMeta({
        canonicalPath: `/apply/${encodeURIComponent(puppy.id)}`,
        robots: "noindex, nofollow",
        title: `Apply for ${puppy.name}`
      })
    });
  }

  const duplicate = applications.find(application =>
    sameBuyerApplication(application, puppy.id, values)
  );

  if (duplicate) {
    res.cookie(
      "imperialpaws_application",
      JSON.stringify({ puppyId: puppy.id, trackingCode: duplicate.id }),
      { maxAge: 31536000000, httpOnly: true, sameSite: "lax" }
    );
    return res.redirect(`/apply/confirmation/${duplicate.id}?existing=1`);
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

  // Trigger optional email confirmation to applicant & alert to breeder
  const {
    sendApplicationConfirmationEmail,
    sendBreederNewApplicationAlert
  } = require("./utils/emailService");
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const newApp = { ...values, trackingCode, id: trackingCode };
  sendApplicationConfirmationEmail(newApp, baseUrl).catch(err => console.error("Applicant confirmation email error:", err));
  sendBreederNewApplicationAlert(newApp).catch(err => console.error("Breeder alert email error:", err));

  res.cookie(
    "imperialpaws_application",
    JSON.stringify({ puppyId: puppy.id, trackingCode }),
    { maxAge: 31536000000, httpOnly: true, sameSite: "lax" }
  );

  res.redirect(`/apply/confirmation/${trackingCode}`);
}));

app.get("/apply/confirmation/:code", (req, res) => {
  res.render("home/apply-confirmation", {
    existingApplication: req.query.existing === "1",
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: `/apply/confirmation/${encodeURIComponent(req.params.code)}`,
      robots: "noindex, nofollow",
      title: "Application Tracking Code"
    }),
    trackingCode: req.params.code
  });
});

app.get("/track", (req, res) => {
  res.render("home/track", {
    error: null,
    code: req.query.code || "",
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: "/track",
      description:
        "Track an ImperialPaws Pekingese adoption application using the private tracking code provided after submission.",
      robots: "noindex, follow",
      title: "Track Your Application"
    })
  });
});

app.get("/testimonials/submit", (req, res) => {
  res.render("home/testimonial-submit", {
    error: null,
    values: {},
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: "/testimonials/submit",
      robots: "noindex, follow",
      title: "Share Your ImperialPaws Experience"
    })
  });
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
      values,
      pageMeta: res.locals.buildPageMeta({
        canonicalPath: "/testimonials/submit",
        robots: "noindex, follow",
        title: "Share Your ImperialPaws Experience"
      })
    });
  }

  const testimonials = await loadTestimonials();
  testimonials.push(createTestimonial(values));
  await saveTestimonials(testimonials);
  res.render("home/testimonial-thankyou", {
    pageMeta: res.locals.buildPageMeta({
      canonicalPath: "/testimonials/submit",
      robots: "noindex, nofollow",
      title: "Testimonial Submitted"
    })
  });
}));

app.use((req, res) => {
  res.status(404).send("Page not found");
});

app.use((err, req, res, next) => {
  console.error(err);

  if (
    err.code === "PERSISTENT_DATA_STORE_REQUIRED" ||
    err.code === "PERSISTENT_IMAGE_STORAGE_REQUIRED"
  ) {
    return res.status(503).send(
      "Production storage is not configured. Please check MongoDB and Cloudinary environment variables before saving data."
    );
  }

  res.status(500).send("Something went wrong. Please try again.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MongoDB ${describeMongoConfig()}`);
  console.log(`ImperialPaws running at http://localhost:${PORT}`);
});
