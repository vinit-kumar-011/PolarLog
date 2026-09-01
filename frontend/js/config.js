// The one place the API address lives.
const API_BASE = "http://localhost:5000";

// Small helper so every page fetches the same way
async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return response.json();
}
