/* =========================================================
   POLARLOG LANDING PAGE JAVASCRIPT
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  /* =====================================================
       1. NAVBAR ACTIVE SECTION
    ====================================================== */

  const navLinks = document.querySelectorAll(".polar-navbar .nav-link");

  const sections = document.querySelectorAll("main[id], section[id]");

  function updateActiveNav() {
    const scrollPosition = window.scrollY + 180;

    let currentSection = "home";

    sections.forEach((section) => {
      if (scrollPosition >= section.offsetTop) {
        currentSection = section.id;
      }
    });

    navLinks.forEach((link) => {
      link.classList.remove("active");

      const target = link.getAttribute("href");

      if (target === `#${currentSection}`) {
        link.classList.add("active");
      }
    });
  }

  window.addEventListener("scroll", updateActiveNav);

  updateActiveNav();

  /* =====================================================
       2. SCROLL REVEAL
    ====================================================== */

  const revealElements = document.querySelectorAll(
    ".feature-card, .about-item, .cta-card",
  );

  revealElements.forEach((element) => {
    element.classList.add("reveal");
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");

          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.15,
    },
  );

  revealElements.forEach((element) => {
    observer.observe(element);
  });

  /* =====================================================
       3. SMOOTH NAVBAR CLOSE ON MOBILE
    ====================================================== */

  const navCollapse = document.querySelector("#mainNavbar");

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (navCollapse.classList.contains("show")) {
        const collapse = bootstrap.Collapse.getInstance(navCollapse);

        if (collapse) {
          collapse.hide();
        }
      }
    });
  });

  /* =====================================================
       4. HERO BUTTON MICRO INTERACTION
    ====================================================== */

  const heroButton = document.querySelector(".hero-btn");

  if (heroButton) {
    heroButton.addEventListener("mouseenter", () => {
      heroButton.querySelector("span")?.animate(
        [
          {
            transform: "translateX(0)",
          },

          {
            transform: "translateX(5px)",
          },

          {
            transform: "translateX(0)",
          },
        ],
        {
          duration: 450,
        },
      );
    });
  }
});
