function requireAdmin(req, res, next) {
  if (!req.session || !req.session.admin) {
    return res.redirect("/admin/login");
  }
  next();
}

function requireOwner(req, res, next) {
  if (
    !req.session ||
    !req.session.admin ||
    req.session.admin.role !== "owner"
  ) {
    return res.redirect("/admin/dashboard");
  }
  next();
}

module.exports = {
  requireAdmin,
  requireOwner
};
