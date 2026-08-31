/* =========================================================
   POLARLOG — LOGIN (demo)
   No backend. Accepts the demo credentials shown on the card
   (or, for a hackathon demo, any non-empty username + password),
   stashes a "logged in" user in sessionStorage so the shared
   sidebar can greet them by name, then redirects to the
   dashboard.
========================================================= */
(function () {
  var DEMO_USERS = {
    "astro@polarlog.in": {
      password: "polar2026",
      name: "ASTRO",
      role: "Logistics Operator",
    },
  };

  var form = document.getElementById("loginForm");
  var errorBox = document.getElementById("loginError");
  var fillBtn = document.getElementById("fillDemoBtn");

  fillBtn.addEventListener("click", function () {
    document.getElementById("username").value = "astro@polarlog.in";
    document.getElementById("password").value = "polar2026";
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var username = document.getElementById("username").value.trim();
    var password = document.getElementById("password").value;

    var user = DEMO_USERS[username.toLowerCase()];
    var ok = user && user.password === password;

    // Hackathon-demo fallback: any non-empty username + password signs in,
    // so judges don't get stuck if they type their own details.
    if (!ok && username && password) {
      ok = true;
      user = {
        name: username.split("@")[0].toUpperCase(),
        role: "Logistics Operator",
      };
    }

    if (!ok) {
      errorBox.textContent = "Enter an username and password to continue.";
      errorBox.classList.add("show");
      return;
    }

    sessionStorage.setItem("polarlogDemoUser", JSON.stringify(user));
    window.location.href = "dashboard.html";
  });
})();
