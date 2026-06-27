# ImperialPaws

Express/EJS website for a Pekingese puppy breeder with public puppy listings,
adoption applications, application tracking, testimonials, invoices, and an
admin panel.

## Run Locally

```bash
npm install
npm start
```

The app runs at `http://localhost:3000` by default. Set `PORT` to use a
different port.

## Verify Everything

```bash
npm run smoke
```

On Windows PowerShell, use this if script execution is blocked:

```bash
npm.cmd run smoke
```

The smoke test starts the app on a temporary port, checks the public pages,
admin pages, puppy management, image upload/delete, applications, tracking,
invoice creation, invoice email links, payment status, sold status, and
testimonials. It restores the original JSON data when it finishes.

## Render Deployment

This app is configured for Render with `render.yaml`.

Suggested Render settings if creating the service manually:

```text
Service type: Web Service
Environment: Node
Build command: npm install
Start command: npm start
Plan: Free
Health check path: /healthz
Environment variables:
  NODE_ENV=production
  NODE_VERSION=20.19.0
  SESSION_SECRET=<generate a long random value>
  MONGODB_URI=<MongoDB Atlas mongodb+srv:// connection string>
  MONGODB_DB=imperialpaws
  OWNER_USERNAME=<owner admin username>
  OWNER_PASSWORD=<strong owner admin password>
  CLOUDINARY_CLOUD_NAME=<Cloudinary cloud name>
  CLOUDINARY_API_KEY=<Cloudinary API key>
  CLOUDINARY_API_SECRET=<Cloudinary API secret>
```

## Production Storage

Render is pinned to Node `20.19.0` in `render.yaml`, `.node-version`, and
`package.json` so MongoDB Atlas connections use a stable Node LTS runtime.

The app now uses production storage when environment variables are present:

- `MONGODB_URI`: stores puppies, applications, testimonials, invoices, admins,
  and settings in MongoDB Atlas.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`:
  stores puppy images in Cloudinary.

If those variables are not set, the app falls back to local JSON files and local
uploads for development.

### MongoDB Atlas Setup

1. Create a free MongoDB Atlas account.
2. Create a free cluster.
3. Create a database user and password.
4. In Network Access, allow access for Render. For a first free launch, the
   practical option is allowing `0.0.0.0/0`; tighten this later if your hosting
   plan gives you fixed outbound IPs.
5. Copy the driver connection string that starts with `mongodb+srv://` and use
   it as `MONGODB_URI`. URL-encode special password characters before saving it
   in Render; for example, `$` becomes `%24`.

### Cloudinary Setup

1. Create a free Cloudinary account.
2. Copy your Cloud Name, API Key, and API Secret.
3. Add them to Render as the Cloudinary environment variables above.

### Migrate Current JSON Data To MongoDB

Run this once after creating your MongoDB Atlas database:

```powershell
$env:MONGODB_URI="your MongoDB mongodb+srv:// connection string"
$env:MONGODB_DB="imperialpaws"
$env:OWNER_USERNAME="your owner username"
$env:OWNER_PASSWORD="your strong owner password"
npm.cmd run migrate:mongo
```

The migration copies the current JSON data into MongoDB and hashes any plaintext
admin passwords. If `OWNER_PASSWORD` is not set, the migrated owner account keeps
the local seed password, so set it before production.

After deployment, log in as owner and use Admins to reset any admin passwords.

## Admin Login

For production, set `OWNER_USERNAME` and `OWNER_PASSWORD` in Render. When the
admin collection is empty, the app creates the owner account from those
environment variables.

For local development, set `OWNER_USERNAME` and `OWNER_PASSWORD` in your shell or
`.env` before starting the app. The committed JSON seed data is intentionally
empty so private admin credentials are not stored in GitHub.
