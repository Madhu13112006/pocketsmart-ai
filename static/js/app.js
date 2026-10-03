// PocketSmart AI — shared frontend helpers used across planner pages.

function formatINR(amount) {
  const n = Number(amount) || 0;
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function showBanner(el, message) {
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
}

function hideBanner(el) {
  if (!el) return;
  el.style.display = "none";
}

function setLoading(spinnerEl, isLoading) {
  if (!spinnerEl) return;
  spinnerEl.style.display = isLoading ? "block" : "none";
}

function shoppingLinksHtml(links) {
  if (!links) return "";
  const labels = {
    amazon: "Amazon", flipkart: "Flipkart", ikea: "IKEA", myntra: "Myntra",
    ajio: "Ajio", bigbasket: "BigBasket", swiggy: "Swiggy", zomato: "Zomato",
    bookmyshow: "BookMyShow", meesho: "Meesho", google: "Google",
    booking: "Booking.com", makemytrip: "MakeMyTrip", oyorooms: "OYO",
    nobroker: "NoBroker", bluestone: "BlueStone", tanishq: "Tanishq",
    caratlane: "CaratLane", melorra: "Melorra",
  };
  return Object.entries(links)
    .map(([key, url]) => `<a class="btn-link-chip" href="${url}" target="_blank" rel="noopener">${labels[key] || key}</a>`)
    .join("");
}

function fallbackBannerHtml(result) {
  if (result && result.source === "fallback") {
    return `<div class="fallback-banner"><i class="fa-solid fa-triangle-exclamation"></i>
      Showing a standard budget estimate because the AI recommendation service was unavailable.</div>`;
  }
  return "";
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options });
  if (!response.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const data = await response.json();
      detail = data.detail || detail;
    } catch (_) { /* ignore parse errors */ }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return response.json();
}

async function logout() {
  await fetch("/logout", { method: "POST", credentials: "include" });
  window.location.href = "/login";
}
