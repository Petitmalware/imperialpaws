const fs = require("fs");
const path = require("path");

process.env.NODE_ENV = "production";
process.env.MONGODB_URI = "";
process.env.DATA_STORE_LOCAL_FALLBACK = "true";
process.env.IMAGE_STORAGE_LOCAL_FALLBACK = "true";
delete process.env.DATA_STORE_ALLOW_LOCAL_PRODUCTION;
delete process.env.IMAGE_STORAGE_ALLOW_LOCAL_PRODUCTION;
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;

const appRoot = path.join(__dirname, "..");
const puppiesFile = path.join(appRoot, "server", "data", "puppies.json");
const backup = fs.existsSync(puppiesFile)
  ? fs.readFileSync(puppiesFile, "utf-8")
  : "[]";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectCode(promise, code, message) {
  try {
    await promise;
  } catch (err) {
    assert(err.code === code, `${message}; got ${err.code || err.name}`);
    return;
  }

  throw new Error(`${message}; no error was thrown.`);
}

async function main() {
  const { getDataStoreStatus, saveCollection } = require("../server/utils/dataStore");
  const {
    getImageStorageStatus,
    savePuppyImage
  } = require("../server/utils/imageStorage");

  const dataStatus = getDataStoreStatus();
  assert(dataStatus.mode === "missing-mongo", "Production without Mongo should report missing Mongo.");
  assert(dataStatus.fallbackEnabled === false, "Production data fallback should be disabled.");

  await expectCode(
    saveCollection("puppies", [{ id: "unsafe-production-write" }]),
    "PERSISTENT_DATA_STORE_REQUIRED",
    "Production data write should reject local JSON fallback"
  );

  assert(
    fs.readFileSync(puppiesFile, "utf-8") === backup,
    "Rejected production data write should not modify local JSON."
  );

  const imageStatus = getImageStorageStatus();
  assert(
    imageStatus.mode === "missing-cloudinary",
    "Production without Cloudinary should report missing Cloudinary."
  );
  assert(imageStatus.fallbackEnabled === false, "Production image fallback should be disabled.");

  await expectCode(
    savePuppyImage(
      {
        buffer: Buffer.from("not-a-real-image"),
        originalname: "unsafe.jpg"
      },
      { puppyId: "unsafe-production-write", imageId: "unsafe-image" }
    ),
    "PERSISTENT_IMAGE_STORAGE_REQUIRED",
    "Production image upload should reject local filesystem fallback"
  );

  console.log("Production storage safety test passed.");
}

main()
  .catch(err => {
    console.error("Production storage safety test failed.");
    console.error(err.stack || err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.writeFileSync(puppiesFile, backup, "utf-8");
  });
