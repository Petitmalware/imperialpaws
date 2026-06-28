const DEFAULT_SITE_NAME = "ImperialPaws Pekingese";
const DEFAULT_DESCRIPTION =
  "ImperialPaws Pekingese is a responsible Pekingese breeder serving families across the United States with thoughtful puppy placement, application review, status tracking, and clear adoption invoices.";
const DEFAULT_KEYWORDS =
  "Pekingese puppies, Pekingese breeder USA, ImperialPaws Pekingese, responsible Pekingese breeder, Pekingese adoption";
const DEFAULT_IMAGE = "/images/hero-pekingese.jpg";

function clean(value) {
  return String(value || "").trim();
}

function stripTrailingSlash(value) {
  return clean(value).replace(/\/+$/, "");
}

function getSiteName(settings = {}) {
  return clean(settings.meta && settings.meta.siteName) || DEFAULT_SITE_NAME;
}

function getDefaultDescription(settings = {}) {
  return clean(settings.meta && settings.meta.description) || DEFAULT_DESCRIPTION;
}

function getBaseUrl(req, settings = {}) {
  const configured =
    stripTrailingSlash(settings.meta && settings.meta.siteUrl) ||
    stripTrailingSlash(process.env.PUBLIC_SITE_URL);

  if (configured) return configured;
  return `${req.protocol}://${req.get("host")}`;
}

function toAbsoluteUrl(value, baseUrl) {
  const next = clean(value);
  if (!next) return "";
  if (/^https?:\/\//i.test(next)) return next;
  return `${stripTrailingSlash(baseUrl)}${next.startsWith("/") ? next : `/${next}`}`;
}

function buildPageMeta(req, settings = {}, overrides = {}) {
  const baseUrl = getBaseUrl(req, settings);
  const siteName = getSiteName(settings);
  const rawTitle =
    clean(overrides.title) ||
    clean(settings.meta && settings.meta.title) ||
    siteName;
  const title = rawTitle.includes(siteName) ? rawTitle : `${rawTitle} | ${siteName}`;
  const description = clean(overrides.description) || getDefaultDescription(settings);
  const canonicalPath = clean(overrides.canonicalPath) || req.path || "/";
  const image = toAbsoluteUrl(
    clean(overrides.image) || clean(settings.meta && settings.meta.image) || DEFAULT_IMAGE,
    baseUrl
  );

  return {
    baseUrl,
    canonicalUrl: toAbsoluteUrl(canonicalPath, baseUrl),
    description,
    image,
    keywords:
      clean(overrides.keywords) ||
      clean(settings.meta && settings.meta.keywords) ||
      DEFAULT_KEYWORDS,
    locale: "en_US",
    robots: clean(overrides.robots) || (req.path.startsWith("/admin") ? "noindex, nofollow" : "index, follow"),
    siteName,
    title,
    type: clean(overrides.type) || "website"
  };
}

function socialLinks(settings = {}) {
  return Object.values(settings.socials || {}).filter(Boolean);
}

function buildOrganizationSchema(settings = {}, baseUrl) {
  const siteName = getSiteName(settings);
  const contact = settings.contact || {};
  const schema = {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness"],
    name: siteName,
    url: baseUrl,
    image: toAbsoluteUrl(
      clean(settings.meta && settings.meta.image) || DEFAULT_IMAGE,
      baseUrl
    ),
    logo: toAbsoluteUrl(DEFAULT_IMAGE, baseUrl),
    description: getDefaultDescription(settings),
    areaServed: {
      "@type": "Country",
      name: "United States"
    },
    priceRange: "$$"
  };

  if (contact.email) schema.email = contact.email;
  if (contact.phone) schema.telephone = contact.phone;
  if (contact.location) {
    schema.address = {
      "@type": "PostalAddress",
      addressCountry: "US",
      addressLocality: contact.location
    };
  }

  const sameAs = socialLinks(settings);
  if (sameAs.length) schema.sameAs = sameAs;

  return schema;
}

function buildWebSiteSchema(settings = {}, baseUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: getSiteName(settings),
    url: baseUrl,
    inLanguage: "en-US",
    publisher: {
      "@type": "Organization",
      name: getSiteName(settings)
    }
  };
}

function buildBreadcrumbSchema(baseUrl, items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(item.url, baseUrl)
    }))
  };
}

function buildFAQSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(item => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer
      }
    }))
  };
}

function getCoverImage(puppy) {
  const images = Array.isArray(puppy.images) ? puppy.images : [];
  return (images.find(image => image.isCover) || images[0] || {}).path || "";
}

function puppyAvailability(status) {
  const normalized = clean(status).toLowerCase();
  if (normalized === "sold") return "https://schema.org/SoldOut";
  if (normalized === "reserved") return "https://schema.org/LimitedAvailability";
  return "https://schema.org/InStock";
}

function buildPuppySchema(puppy, baseUrl) {
  const image = getCoverImage(puppy);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${puppy.name} - ${puppy.breed || "Pekingese"} Puppy`,
    brand: {
      "@type": "Brand",
      name: DEFAULT_SITE_NAME
    },
    category: "Pekingese puppy adoption",
    description:
      clean(puppy.description) ||
      "Home-raised Pekingese puppy available through a responsible adoption application process.",
    url: toAbsoluteUrl(`/puppies/${encodeURIComponent(puppy.id)}`, baseUrl)
  };

  if (image) schema.image = toAbsoluteUrl(image, baseUrl);

  if (puppy.price) {
    schema.offers = {
      "@type": "Offer",
      price: String(puppy.price),
      priceCurrency: clean(puppy.currency) || "USD",
      availability: puppyAvailability(puppy.status),
      url: schema.url
    };
  }

  return schema;
}

function buildPuppyItemListSchema(puppies, baseUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Available Pekingese puppies",
    itemListElement: puppies.slice(0, 24).map((puppy, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: puppy.name,
      url: toAbsoluteUrl(`/puppies/${encodeURIComponent(puppy.id)}`, baseUrl)
    }))
  };
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = {
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE,
  DEFAULT_KEYWORDS,
  DEFAULT_SITE_NAME,
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
};
