function getCurrencySymbol(code) {
  const map = {
    USD: "$",
    CAD: "$",
    EUR: "\u20ac",
    GBP: "\u00a3",
    NGN: "\u20a6"
  };

  return map[code] || "$";
}

module.exports = { getCurrencySymbol };
