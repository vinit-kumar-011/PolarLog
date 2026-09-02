/* =========================================================
   POLARLOG — LOGIN
   Calls the real POST /api/auth/login endpoint (auth.py) and
   checks the password against the database via werkzeug's
   check_password_hash. Stores the returned user under the same
   sessionStorage key pl-sidebar.js already reads, so the
   sidebar greeting keeps working unchanged.
========================================================= */
(function () {
  var form = document.getElementById("loginForm");
  var errorBox = document.getElementById("loginError");
  var fillBtn = document.getElementById("fillDemoBtn");
  var submitBtn = form.querySelector(".login-submit");

  fillBtn.addEventListener("click", function () {
    document.getElementById("username").value = "bhr_office";
    document.getElementById("password").value = "bharati2026";
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.add("show");
  }

  function clearError() {
    errorBox.classList.remove("show");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearError();

    var username = document.getElementById("username").value.trim();
    var password = document.getElementById("password").value;

    if (!username || !password) {
      showError("Enter a username and password to continue.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";

    fetch(API_BASE + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(function (response) {
        return response.json().then(function (body) {
          return { ok: response.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          showError(result.body.error || "Invalid username or password.");
          return;
        }

        var user = {
          user_id: result.body.user_id,
          name: result.body.full_name || result.body.username,
          role: result.body.role,
          station: result.body.station,
        };

        sessionStorage.setItem("polarlogDemoUser", JSON.stringify(user));
        window.location.href = "dashboard.html";
      })
      .catch(function () {
        showError("Could not reach the server. Is the backend running?");
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
      });
  });
})();
