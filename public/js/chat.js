// Chat with an agent in character (POST /api/ai/chat). History stays in this tab only.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function mount(box, agent) {
    const history = [];
    box.innerHTML = `
      <div class="chat-log" data-log><p class="chat-hint">Say hi to ${esc(agent.name)}. It answers in character.</p></div>
      <form class="chat-form" data-cform>
        <input maxlength="1200" placeholder="Message ${esc(agent.name)}…" aria-label="Message ${esc(agent.name)}" autocomplete="off">
        <button class="prompt-send" type="submit" aria-label="Send"><svg class="icon"><use href="#i-arrow-up"/></svg></button>
      </form>`;
    const log = box.querySelector("[data-log]"), form = box.querySelector("[data-cform]"), input = form.querySelector("input");
    const add = (role, text) => {
      log.querySelector(".chat-hint")?.remove();
      const p = document.createElement("p"); p.className = "chat-msg " + role; p.textContent = text;
      log.appendChild(p); log.scrollTop = log.scrollHeight; return p;
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim(); if (!text) return;
      input.value = ""; add("user", text); history.push({ role: "user", content: text });
      const wait = add("assistant typing", "…");
      form.querySelector("button").disabled = true;
      try {
        const r = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: agent.id, messages: history }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "No reply");
        wait.className = "chat-msg assistant"; wait.textContent = j.reply || "…";
        history.push({ role: "assistant", content: j.reply || "" });
      } catch (x) {
        wait.className = "chat-msg error"; wait.textContent = x.message;
        history.pop();
      } finally { form.querySelector("button").disabled = false; input.focus(); }
    });
  }

  window.OrvynChat = { mount };
})();
