function getCurrencySymbol(code) {
  const map = {
    USD: "$",
    CAD: "$",
    EUR: "€",
    GBP: "£",
    NGN: "₦"
  };

  return map[code] || "$";
}

module.exports = { getCurrencySymbol };
