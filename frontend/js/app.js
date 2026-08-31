document.addEventListener("DOMContentLoaded", () => {
  const user = sessionStorage.getItem("polarLogUser");
  const protectedPage = document.body.dataset.protected === "true";

  if (protectedPage && !user) {
    window.location.replace("login.html");
    return;
  }

  document.querySelectorAll("[data-user]").forEach((element) => {
    element.textContent = user || "Guest";
  });

  const form = document.querySelector("#loginForm");
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const username = form.elements.username.value.trim();
      const password = form.elements.password.value;
      const error = form.querySelector(".error");

      if (!username || !password) {
        error.textContent = "Enter your username and password.";
        return;
      }

      sessionStorage.setItem("polarLogUser", username);
      window.location.href = "dashboard.html";
    });
  }

  document.querySelector("[data-logout]")?.addEventListener("click", () => {
    sessionStorage.removeItem("polarLogUser");
    window.location.href = "login.html";
  });
});
