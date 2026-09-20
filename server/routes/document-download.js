const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { getDelivery } = require('../utils/documentDelivery');
router.get('/documents/:token', asyncHandler(async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  const delivery = await getDelivery(req.params.token);
  if (!delivery) return res.status(404).send('Document not found. Please ask the breeder to resend it.');
  res.type('application/pdf');
  res.attachment(delivery.filename);
  res.send(Buffer.from(delivery.pdf, 'base64'));
}));
module.exports = router;
