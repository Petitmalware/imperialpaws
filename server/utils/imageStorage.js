const fs = require("fs");
const path = require("path");
const cloudinary = require("cloudinary").v2;

const UPLOAD_ROOT = path.join(__dirname, "../../public/uploads/puppies");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ALLOW_LOCAL_PRODUCTION =
  process.env.IMAGE_STORAGE_ALLOW_LOCAL_PRODUCTION === "true";
const LOCAL_IMAGE_FALLBACK_ENABLED =
  (!IS_PRODUCTION || ALLOW_LOCAL_PRODUCTION) &&
  process.env.IMAGE_STORAGE_LOCAL_FALLBACK !== "false";

const cloudinaryReady =
  Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
  Boolean(process.env.CLOUDINARY_API_KEY) &&
  Boolean(process.env.CLOUDINARY_API_SECRET);

if (cloudinaryReady) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

function safeSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function usingCloudinary() {
  return cloudinaryReady;
}

function getImageStorageStatus() {
  let mode = "cloudinary";

  if (!usingCloudinary()) {
    mode = LOCAL_IMAGE_FALLBACK_ENABLED ? "local" : "missing-cloudinary";
  }

  return {
    cloudinaryConfigured: usingCloudinary(),
    fallbackEnabled: LOCAL_IMAGE_FALLBACK_ENABLED,
    isProduction: IS_PRODUCTION,
    mode,
    productionRequiresCloudinary: IS_PRODUCTION && !ALLOW_LOCAL_PRODUCTION
  };
}

function createPersistentImageStorageError() {
  const err = new Error(
    "Production image uploads require Cloudinary. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
  );
  err.name = "PersistentImageStorageRequiredError";
  err.code = "PERSISTENT_IMAGE_STORAGE_REQUIRED";
  return err;
}

function uploadToCloudinary(buffer, { puppyId, imageId }) {
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: `imperialpaws/puppies/${safeSegment(puppyId)}`,
        public_id: safeSegment(imageId),
        resource_type: "image",
        overwrite: true
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          path: result.secure_url,
          publicId: result.public_id,
          storage: "cloudinary"
        });
      }
    );

    upload.end(buffer);
  });
}

function uploadToLocal(file, { puppyId, imageId }) {
  const dir = path.join(UPLOAD_ROOT, safeSegment(puppyId));
  const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
  const filename = `${safeSegment(imageId)}${ext}`;

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), file.buffer);

  return {
    path: `/uploads/puppies/${safeSegment(puppyId)}/${filename}`,
    publicId: "",
    storage: "local"
  };
}

async function savePuppyImage(file, { puppyId, imageId }) {
  if (!file || !file.buffer) {
    throw new Error("No image file received.");
  }

  if (usingCloudinary()) {
    return uploadToCloudinary(file.buffer, { puppyId, imageId });
  }

  if (!LOCAL_IMAGE_FALLBACK_ENABLED) {
    throw createPersistentImageStorageError();
  }

  return uploadToLocal(file, { puppyId, imageId });
}

async function deletePuppyImage(image) {
  if (!image) return;

  if (image.storage === "cloudinary" && image.publicId && usingCloudinary()) {
    await cloudinary.uploader.destroy(image.publicId, { resource_type: "image" });
    return;
  }

  if (!image.path || image.path.startsWith("http")) return;

  const absolutePath = path.join(
    __dirname,
    "../../public",
    image.path.replace(/^\/+/, "")
  );
  const resolvedPath = path.resolve(absolutePath);
  const resolvedUploads = path.resolve(UPLOAD_ROOT);

  if (!resolvedPath.startsWith(resolvedUploads)) return;
  if (fs.existsSync(resolvedPath)) fs.unlinkSync(resolvedPath);
}

module.exports = {
  deletePuppyImage,
  getImageStorageStatus,
  savePuppyImage,
  usingCloudinary
};
