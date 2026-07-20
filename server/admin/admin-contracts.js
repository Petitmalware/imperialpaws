/* =====================================================
   ImperialPaws – Admin Contracts Router
   Full CRUD for editable adoption contract templates.
   Accessible at /admin/contracts
===================================================== */
const express = require("express");
const router = express.Router();
const { requireAdmin } = require("./admin-auth");
const asyncHandler = require("../utils/asyncHandler");
const {
  loadContracts,
  getContract,
  createContract,
  updateContract,
  deleteContract
} = require("../utils/contractStore");

/* ── List all contracts ────────────────────────────── */
router.get(
  "/contracts",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const contracts = await loadContracts();
    const flash = req.session._flash || null;
    delete req.session._flash;
    res.render("admin/contracts/index", {
      contracts,
      flash,
      active: "contracts",
      layout: "layouts/main"
    });
  })
);

/* ── New contract form ─────────────────────────────── */
router.get("/contracts/new", requireAdmin, (req, res) => {
  res.render("admin/contracts/edit", {
    contract: null,
    error: null,
    active: "contracts",
    layout: "layouts/main"
  });
});

/* ── Create contract ───────────────────────────────── */
router.post(
  "/contracts/new",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, body } = req.body;
    if (!title || !body) {
      return res.status(400).render("admin/contracts/edit", {
        contract: null,
        error: "Title and contract body are required.",
        active: "contracts",
        layout: "layouts/main"
      });
    }
    await createContract({ title, body });
    req.session._flash = { type: "success", message: "Contract template created." };
    res.redirect("/admin/contracts");
  })
);

/* ── Edit contract form ────────────────────────────── */
router.get(
  "/contracts/:id/edit",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const contract = await getContract(req.params.id);
    if (!contract) return res.status(404).send("Contract not found");
    res.render("admin/contracts/edit", {
      contract,
      error: null,
      active: "contracts",
      layout: "layouts/main"
    });
  })
);

/* ── Update contract ───────────────────────────────── */
router.post(
  "/contracts/:id/edit",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, body } = req.body;
    if (!title || !body) {
      const contract = await getContract(req.params.id);
      return res.status(400).render("admin/contracts/edit", {
        contract,
        error: "Title and contract body are required.",
        active: "contracts",
        layout: "layouts/main"
      });
    }
    await updateContract(req.params.id, { title, body });
    req.session._flash = { type: "success", message: "Contract template updated." };
    res.redirect("/admin/contracts");
  })
);

/* ── Delete contract ───────────────────────────────── */
router.post(
  "/contracts/:id/delete",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await deleteContract(req.params.id);
    req.session._flash = { type: "success", message: "Contract deleted." };
    res.redirect("/admin/contracts");
  })
);

/* ── View / print a contract (admin preview) ─────── */
router.get(
  "/contracts/:id/view",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const contract = await getContract(req.params.id);
    if (!contract) return res.status(404).send("Contract not found");
    // Optionally prefill with a buyer name from query param
    const buyerName = req.query.buyer || "[Adopting Parent Name]";
    const filledBody = contract.body
      .replace(/\[BUYER_NAME\]/gi, buyerName)
      .replace(/\[DATE\]/gi, new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
    res.render("admin/contracts/view", {
      contract: { ...contract, filledBody },
      buyerName,
      layout: false
    });
  })
);

/* ── Email a contract directly to an adopter ──────── */
router.post(
  "/contracts/:id/email",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const contract = await getContract(req.params.id);
    if (!contract) return res.status(404).send("Contract not found");
    
    const buyerName = String(req.body.buyerName || "").trim() || "Adopting Parent";
    const buyerEmail = String(req.body.buyerEmail || "").trim();
    
    if (!buyerEmail) {
      req.session._flash = { type: "danger", message: "Please provide the buyer's email address." };
      return res.redirect(`/admin/contracts/${encodeURIComponent(contract.id)}/view`);
    }

    const { sendContractEmail } = require("../utils/emailService");
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const contractViewUrl = `${baseUrl}/admin/contracts/${encodeURIComponent(contract.id)}/view?buyer=${encodeURIComponent(buyerName)}`;
    
    const sent = await sendContractEmail(contract.title, buyerName, buyerEmail, contractViewUrl, baseUrl);
    if (sent) {
      req.session._flash = { type: "success", message: `Contract successfully emailed to ${buyerEmail}!` };
    } else {
      req.session._flash = { type: "danger", message: `Could not send email. Please check SMTP settings in Settings or .env.` };
    }
    
    res.redirect(`/admin/contracts`);
  })
);

module.exports = router;
