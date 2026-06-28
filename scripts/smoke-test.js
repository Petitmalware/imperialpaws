const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const appRoot = path.join(__dirname, "..");
const port = Number(process.env.SMOKE_PORT) || 3230;
const baseUrl = `http://127.0.0.1:${port}`;

const dataFiles = [
  "puppies.json",
  "applications.json",
  "invoices.json",
  "testimonials.json",
  "admins.json",
  "site-settings.json"
].map(file => path.join(appRoot, "server", "data", file));

const backups = new Map();
let child = null;
let createdUploadDir = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/`, { redirect: "manual" });
      if (response.status === 200) return;
    } catch (err) {
      await wait(250);
    }
  }

  throw new Error("Server did not become ready.");
}

async function postForm(url, data, cookie = "") {
  return fetch(`${baseUrl}${url}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(cookie ? { cookie } : {})
    },
    body: new URLSearchParams(data)
  });
}

async function getPage(url, cookie = "") {
  return fetch(`${baseUrl}${url}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {}
  });
}

async function assertRoute(url, expectedStatus, cookie = "") {
  const response = await getPage(url, cookie);
  assert(
    response.status === expectedStatus,
    `${url} expected ${expectedStatus}, got ${response.status}`
  );
  return response;
}

function restoreData() {
  for (const [file, content] of backups) {
    fs.writeFileSync(file, content, "utf-8");
  }

  if (createdUploadDir && fs.existsSync(createdUploadDir)) {
    fs.rmSync(createdUploadDir, { recursive: true, force: true });
  }
}

async function main() {
  for (const file of dataFiles) {
    backups.set(file, fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "[]");
  }

  child = spawn(process.execPath, ["server/app.js"], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      MONGODB_URI: "",
      DATA_STORE_LOCAL_FALLBACK: "true",
      IMAGE_STORAGE_LOCAL_FALLBACK: "true",
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
      OWNER_USERNAME: "owner",
      OWNER_PASSWORD: "password123"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  child.stdout.on("data", data => {
    serverOutput += data.toString();
  });
  child.stderr.on("data", data => {
    serverOutput += data.toString();
  });

  await waitForServer();

  await assertRoute("/", 200);
  await assertRoute("/puppies", 200);
  await assertRoute("/testimonials", 200);
  await assertRoute("/testimonials/submit", 200);
  await assertRoute("/track", 200);
  await assertRoute("/track/result", 400);
  await assertRoute("/track/result?code=bad-code", 404);
  await assertRoute("/admin/login", 200);
  await assertRoute("/invoice/not-real", 404);

  const login = await postForm("/admin/login", {
    username: "owner",
    password: "password123"
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  assert(login.status === 302, "Admin login should redirect.");
  assert(cookie, "Admin login should set a session cookie.");

  const adminRoutes = [
    "/admin/dashboard",
    "/admin/puppies",
    "/admin/puppies/add",
    "/admin/applications",
    "/admin/testimonials",
    "/admin/testimonials/add",
    "/admin/invoices",
    "/admin/invoices/select-application",
    "/admin/settings",
    "/admin/admins"
  ];

  for (const route of adminRoutes) {
    await assertRoute(route, 200, cookie);
  }

  const settingsPost = await postForm(
    "/admin/settings",
    {
      email: "hello@imperialpaws.test",
      phone: "555-1100",
      location: "Test City",
      facebook: "",
      instagram: "",
      twitter: "",
      tiktok: ""
    },
    cookie
  );
  assert(settingsPost.status === 302, "Settings update should redirect.");

  const adminsFile = path.join(appRoot, "server", "data", "admins.json");
  const addAdmin = await postForm(
    "/admin/admins/add",
    { username: "smoke-admin", password: "smoke-pass-123" },
    cookie
  );
  assert(addAdmin.status === 302, "Adding an admin should redirect.");
  let smokeAdmin = readJSON(adminsFile).find(admin => admin.username === "smoke-admin");
  assert(smokeAdmin, "Smoke admin should be stored.");
  assert(smokeAdmin.passwordHash, "New admin password should be hashed.");
  assert(!smokeAdmin.password, "New admin should not store plaintext password.");

  const resetAdminPassword = await postForm(
    `/admin/admins/${smokeAdmin.id}/password`,
    { password: "smoke-pass-456" },
    cookie
  );
  assert(resetAdminPassword.status === 302, "Admin password reset should redirect.");
  smokeAdmin = readJSON(adminsFile).find(admin => admin.username === "smoke-admin");
  assert(smokeAdmin.passwordHash, "Reset password should remain hashed.");

  const deleteAdmin = await postForm(`/admin/admins/${smokeAdmin.id}/delete`, {}, cookie);
  assert(deleteAdmin.status === 302, "Deleting an admin should redirect.");

  const addPuppy = await postForm(
    "/admin/puppies/add",
    {
      name: "Smoke Test Puppy",
      breed: "Pekingese",
      gender: "Female",
      color: "Cream",
      dob: "2026-01-15",
      description: "Temporary test listing",
      vetChecked: "on",
      vaccinationStatus: "Current",
      registrationType: "Breeder records",
      price: "1200",
      currency: "USD",
      status: "Available",
      featured: "on"
    },
    cookie
  );
  assert(addPuppy.status === 302, "Adding a puppy should redirect.");

  const puppiesFile = path.join(appRoot, "server", "data", "puppies.json");
  let puppy = readJSON(puppiesFile).find(item => item.name === "Smoke Test Puppy");
  assert(puppy, "Puppy should be stored.");
  assert(puppy.featured === true, "Featured checkbox should be stored.");
  assert(puppy.vetChecked === true, "Vet checked checkbox should be stored.");

  await assertRoute(`/puppies/${puppy.id}`, 200);

  const editPuppy = await postForm(
    `/admin/puppies/edit/${puppy.id}`,
    {
      name: "Smoke Test Puppy Updated",
      breed: "Pekingese",
      gender: "Female",
      color: "Cream",
      dob: "2026-01-15",
      description: "Updated temporary test listing",
      vaccinationStatus: "Current",
      registrationType: "Breeder records",
      price: "1250",
      currency: "USD",
      status: "Available"
    },
    cookie
  );
  assert(editPuppy.status === 302, "Editing a puppy should redirect.");
  puppy = readJSON(puppiesFile).find(item => item.id === puppy.id);
  assert(puppy.featured === false, "Unchecked featured box should save as false.");
  assert(puppy.vetChecked === false, "Unchecked vet box should save as false.");
  assert(puppy.price === "1250", "Edited price should persist.");

  const imageData = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
  const uploadForm = new FormData();
  uploadForm.set("puppyId", puppy.id);
  uploadForm.set("isCover", "on");
  uploadForm.append("images", new Blob([imageData], { type: "image/png" }), "smoke-1.png");
  uploadForm.append("images", new Blob([imageData], { type: "image/png" }), "smoke-2.png");
  const upload = await fetch(`${baseUrl}/admin/puppies/images/upload`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie },
    body: uploadForm
  });
  assert(upload.status === 302, "Image upload should redirect.");
  puppy = readJSON(puppiesFile).find(item => item.id === puppy.id);
  assert(puppy.images.length === 2, "Uploaded images should be stored.");
  assert(
    puppy.images.filter(image => image.isCover).length === 1,
    "One uploaded image should be marked as cover."
  );
  createdUploadDir = path.join(appRoot, "public", "uploads", "puppies", puppy.id);
  assert(fs.existsSync(createdUploadDir), "Uploaded image directory should exist.");

  const imageDelete = await postForm(
    "/admin/puppies/images/delete",
    { puppyId: puppy.id, imageId: puppy.images[0].id },
    cookie
  );
  assert(imageDelete.status === 302, "Image delete should redirect.");
  puppy = readJSON(puppiesFile).find(item => item.id === puppy.id);
  assert(puppy.images.length === 1, "Deleted image should be removed from data.");
  assert(
    puppy.images.some(image => image.isCover),
    "Remaining image should become cover after deleting the cover image."
  );

  const apply = await postForm("/apply", {
    puppyId: puppy.id,
    name: "Test Buyer",
    email: "buyer@example.com",
    phone: "555-1000",
    location: "Test City",
    message: "Temporary application"
  });
  assert(apply.status === 302, "Application submit should redirect.");

  const applicationsFile = path.join(appRoot, "server", "data", "applications.json");
  let application = readJSON(applicationsFile).find(item => item.email === "buyer@example.com");
  assert(application, "Application should be stored.");
  await assertRoute(`/track/result?code=${encodeURIComponent(application.id)}`, 200);

  const approve = await postForm(
    `/admin/applications/${application.id}/status`,
    { status: "Approved" },
    cookie
  );
  assert(approve.status === 302, "Application approval should redirect.");
  application = readJSON(applicationsFile).find(item => item.id === application.id);
  puppy = readJSON(puppiesFile).find(item => item.id === puppy.id);
  assert(application.status === "Approved", "Application should be approved.");
  assert(puppy.status === "Reserved", "Approved application should reserve puppy.");

  const invoiceAddPage = await assertRoute(`/admin/invoices/add/${application.id}`, 200, cookie);
  const invoiceAddHtml = await invoiceAddPage.text();
  assert(invoiceAddHtml.includes('value="buyer@example.com"'), "Invoice form should prefill buyer email.");
  assert(invoiceAddHtml.includes('value="555-1000"'), "Invoice form should prefill buyer phone.");
  assert(invoiceAddHtml.includes('value="1250"'), "Invoice form should prefill puppy price.");
  assert(invoiceAddHtml.includes("Thank you for choosing ImperialPaws"), "Invoice form should include adoption note.");

  const createInvoice = await postForm(
    "/admin/invoices/add",
    {
      applicationId: application.id,
      puppyId: puppy.id,
      currency: "$",
      issueDate: "2026-06-27",
      dueDate: "2026-07-04",
      sellerName: "ImperialPaws",
      sellerEmail: "hello@imperialpaws.test",
      parentName: "Test Buyer",
      parentEmail: "buyer@example.com",
      parentPhone: "555-1000",
      itemDescription: "Smoke Test Puppy Updated - Puppy Adoption Fee",
      itemQty: "1",
      itemPrice: "1250",
      taxRate: "0",
      notes: ""
    },
    cookie
  );
  assert(createInvoice.status === 302, "Invoice creation should redirect.");

  const invoicesFile = path.join(appRoot, "server", "data", "invoices.json");
  const invoice = readJSON(invoicesFile).find(item => item.applicationId === application.id);
  assert(invoice, "Invoice should be stored.");
  assert(invoice.notes.includes("Thank you for choosing ImperialPaws"), "Default adoption note should be stored.");

  const publicInvoice = await assertRoute(
    `/invoice/${application.id}/${invoice.invoiceNumber}`,
    200
  );
  const publicInvoiceHtml = await publicInvoice.text();
  assert(publicInvoiceHtml.includes("Adoption Note"), "Public invoice should show adoption note.");
  assert(publicInvoiceHtml.includes("1250.00"), "Public invoice should show invoice total.");

  const adminInvoiceIndex = await assertRoute("/admin/invoices", 200, cookie);
  const adminInvoiceIndexHtml = await adminInvoiceIndex.text();
  assert(adminInvoiceIndexHtml.includes("mailto:buyer%40example.com"), "Invoice list should include buyer email action.");
  assert(adminInvoiceIndexHtml.includes(encodeURIComponent(`/invoice/${application.id}/${invoice.invoiceNumber}`)), "Email body should include public invoice URL.");

  const adminInvoiceView = await assertRoute(
    `/admin/invoices/view/${invoice.invoiceNumber}`,
    200,
    cookie
  );
  const adminInvoiceViewHtml = await adminInvoiceView.text();
  assert(adminInvoiceViewHtml.includes("Email Buyer"), "Invoice view should include email buyer action.");
  assert(adminInvoiceViewHtml.includes("Adoption Note"), "Admin invoice view should show adoption note.");

  const togglePaid = await postForm(
    `/admin/invoices/${invoice.invoiceNumber}/toggle-paid`,
    {},
    cookie
  );
  assert(togglePaid.status === 302, "Mark paid should redirect.");
  const paidInvoice = readJSON(invoicesFile).find(item => item.invoiceNumber === invoice.invoiceNumber);
  assert(paidInvoice.paid === true, "Mark paid should set paid true.");

  const sold = await postForm(
    `/admin/applications/${application.id}/status`,
    { status: "Sold" },
    cookie
  );
  assert(sold.status === 302, "Mark sold should redirect.");
  application = readJSON(applicationsFile).find(item => item.id === application.id);
  puppy = readJSON(puppiesFile).find(item => item.id === puppy.id);
  assert(application.status === "Sold", "Application should be sold.");
  assert(puppy.status === "Sold", "Sold application should mark puppy sold.");

  const testimonialSubmit = await postForm("/testimonials/submit", {
    name: "Smoke Family",
    email: "family@example.com",
    location: "Test City",
    message: "A wonderful experience."
  });
  assert(testimonialSubmit.status === 200, "Public testimonial submit should render thank-you page.");
  const testimonialsFile = path.join(appRoot, "server", "data", "testimonials.json");
  const testimonial = readJSON(testimonialsFile).find(item => item.email === "family@example.com");
  assert(testimonial && testimonial.approved === false, "Public testimonial should start pending.");
  const approveTestimonial = await postForm(
    `/admin/testimonials/${testimonial.id}/approve`,
    {},
    cookie
  );
  assert(approveTestimonial.status === 302, "Testimonial approval should redirect.");
  const approvedTestimonial = readJSON(testimonialsFile).find(item => item.id === testimonial.id);
  assert(approvedTestimonial.approved === true, "Testimonial should approve.");

  console.log("Smoke test passed.");
  if (serverOutput.trim()) {
    console.log(serverOutput.trim());
  }
}

main()
  .catch(err => {
    console.error("Smoke test failed.");
    console.error(err.stack || err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (child) {
      child.kill();
      await new Promise(resolve => child.once("exit", resolve));
    }
    restoreData();
  });
