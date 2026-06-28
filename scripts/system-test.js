const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const appRoot = path.join(__dirname, "..");
const port = Number(process.env.SYSTEM_TEST_PORT) || 3231;
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function restoreData() {
  for (const [file, content] of backups) {
    fs.writeFileSync(file, content, "utf-8");
  }
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/healthz`, { redirect: "manual" });
      if (response.status === 200) return;
    } catch (err) {
      await wait(250);
    }
  }

  throw new Error("Server did not become ready.");
}

async function timedFetch(url, options = {}, maxMs = 3500) {
  const start = Date.now();
  const response = await fetch(`${baseUrl}${url}`, options);
  const elapsed = Date.now() - start;
  assert(elapsed < maxMs, `${url} took ${elapsed}ms, expected under ${maxMs}ms.`);
  return response;
}

async function postForm(url, data, cookie = "") {
  return timedFetch(url, {
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
  return timedFetch(url, {
    redirect: "manual",
    headers: cookie ? { cookie } : {}
  });
}

async function assertRoute(url, expectedStatus, cookie = "") {
  const response = await getPage(url, cookie);
  const body = await response.text();

  assert(
    response.status === expectedStatus,
    `${url} expected ${expectedStatus}, got ${response.status}`
  );
  assert(
    !body.includes("Something went wrong"),
    `${url} rendered the generic error page.`
  );

  return { response, body };
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
      MONGODB_URI: "mongodb://127.0.0.1:1/?directConnection=true",
      MONGODB_DB: "imperialpaws",
      MONGODB_TIMEOUT_MS: "400",
      MONGODB_RETRY_COOLDOWN_MS: "10000",
      DATA_STORE_LOCAL_FALLBACK: "true",
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
  await assertRoute("/admin/login", 200);

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

  const addPuppy = await postForm(
    "/admin/puppies/add",
    {
      name: "System Test Puppy",
      breed: "Pekingese",
      gender: "Male",
      color: "Fawn",
      dob: "2026-02-01",
      description: "Temporary system test listing",
      vaccinationStatus: "Current",
      registrationType: "Breeder records",
      price: "1500",
      currency: "USD",
      status: "Available",
      featured: "on"
    },
    cookie
  );
  assert(addPuppy.status === 302, "Adding a puppy should redirect.");

  const puppiesFile = path.join(appRoot, "server", "data", "puppies.json");
  let puppy = readJSON(puppiesFile).find(item => item.name === "System Test Puppy");
  assert(puppy, "Puppy should be stored by fallback data store.");
  await assertRoute(`/puppies/${puppy.id}`, 200);

  const apply = await postForm("/apply", {
    puppyId: puppy.id,
    name: "System Buyer",
    email: "system-buyer@example.com",
    phone: "555-2200",
    location: "System City",
    message: "Temporary system application"
  });
  assert(apply.status === 302, "Application submit should redirect.");

  const applicationsFile = path.join(appRoot, "server", "data", "applications.json");
  let application = readJSON(applicationsFile).find(
    item => item.email === "system-buyer@example.com"
  );
  assert(application, "Application should be stored by fallback data store.");
  await assertRoute(`/track/result?code=${encodeURIComponent(application.id)}`, 200);

  const approve = await postForm(
    `/admin/applications/${application.id}/status`,
    { status: "Approved" },
    cookie
  );
  assert(approve.status === 302, "Application approval should redirect.");

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
      parentName: "System Buyer",
      parentEmail: "system-buyer@example.com",
      parentPhone: "555-2200",
      itemDescription: "System Test Puppy - Puppy Adoption Fee",
      itemQty: "1",
      itemPrice: "1500",
      taxRate: "0",
      notes: ""
    },
    cookie
  );
  assert(createInvoice.status === 302, "Invoice creation should redirect.");

  const invoicesFile = path.join(appRoot, "server", "data", "invoices.json");
  const invoice = readJSON(invoicesFile).find(item => item.applicationId === application.id);
  assert(invoice, "Invoice should be stored by fallback data store.");
  await assertRoute(`/invoice/${application.id}/${invoice.invoiceNumber}`, 200);

  const testimonialSubmit = await postForm("/testimonials/submit", {
    name: "System Family",
    email: "system-family@example.com",
    location: "System City",
    message: "A reliable test experience."
  });
  assert(
    testimonialSubmit.status === 200,
    "Public testimonial submit should render thank-you page."
  );

  const testimonialsFile = path.join(appRoot, "server", "data", "testimonials.json");
  const testimonial = readJSON(testimonialsFile).find(
    item => item.email === "system-family@example.com"
  );
  assert(testimonial, "Testimonial should be stored by fallback data store.");

  console.log("System fallback test passed.");
  if (serverOutput.trim()) {
    console.log(serverOutput.trim());
  }
}

main()
  .catch(err => {
    console.error("System fallback test failed.");
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
