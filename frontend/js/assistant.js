/* =========================================================
   POLARLOG — ASSISTANT WIDGET
   Floating chat launcher. Injects its own markup so it can be
   dropped onto any page with a single <script> include, after
   config.js (uses apiSend) and auth-guard.js.
   Requires: assistant.css, apiSend() (config.js).
========================================================= */
(function () {
  function buildMarkup() {
    const launcher = document.createElement("button");
    launcher.id = "pl-assistant-launcher";
    launcher.setAttribute("aria-label", "Open PolarLog assistant");
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

    const panel = document.createElement("div");
    panel.id = "pl-assistant-panel";
    panel.innerHTML = `
      <div id="pl-assistant-header">
        <span>PolarLog Assistant</span>
        <button id="pl-assistant-close" aria-label="Close">&times;</button>
      </div>
      <div id="pl-assistant-messages"></div>
      <form id="pl-assistant-form">
        <input id="pl-assistant-input" type="text" autocomplete="off"
               placeholder="Ask about stock, shipments, alerts..." />
        <button type="submit">Ask</button>
      </form>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);
    return { launcher, panel };
  }

  function appendMessage(list, role, text) {
    const div = document.createElement("div");
    div.className = `pl-assistant-msg ${role}`;
    div.textContent = text;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    return div;
  }

  async function askAssistant(question) {
    const result = await apiSend("/api/assistant/ask", "POST", { question });
    if (result.ok) return result.data.answer;
    if (result.queued) return "You're offline — I'll answer once you're back online.";
    return result.error || "Something went wrong asking that.";
  }

  function init() {
    const { launcher, panel } = buildMarkup();
    const messages = panel.querySelector("#pl-assistant-messages");
    const form = panel.querySelector("#pl-assistant-form");
    const input = panel.querySelector("#pl-assistant-input");
    const closeBtn = panel.querySelector("#pl-assistant-close");

    let greeted = false;
    launcher.addEventListener("click", () => {
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) {
        if (!greeted) {
          appendMessage(messages, "assistant", "Ask me about stock levels, shipments, or alerts.");
          greeted = true;
        }
        input.focus();
      }
    });

    closeBtn.addEventListener("click", () => panel.classList.remove("open"));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const question = input.value.trim();
      if (!question) return;

      appendMessage(messages, "user", question);
      input.value = "";
      input.disabled = true;

      const pending = appendMessage(messages, "assistant pending", "Thinking...");
      const answer = await askAssistant(question);
      pending.remove();
      appendMessage(messages, "assistant", answer);

      input.disabled = false;
      input.focus();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
