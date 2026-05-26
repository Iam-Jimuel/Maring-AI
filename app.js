/* =============================================
   MARING AI — MAIN APP SCRIPT
   Connects to Anthropic API for real AI responses
   ============================================= */

(function () {
  "use strict";

  /* ── DOM REFS ─────────────────────────────── */
  const sidebar          = document.getElementById("sidebar");
  const sidebarOverlay   = document.getElementById("sidebarOverlay");
  const sidebarClose     = document.getElementById("sidebarClose");
  const menuBtn          = document.getElementById("menuBtn");
  const newChatBtn       = document.getElementById("newChatBtn");
  const chatHistoryList  = document.getElementById("chatHistoryList");
  const chatArea         = document.getElementById("chatArea");
  const welcomeScreen    = document.getElementById("welcomeScreen");
  const messagesContainer= document.getElementById("messagesContainer");
  const messageInput     = document.getElementById("messageInput");
  const sendBtn          = document.getElementById("sendBtn");
  const uploadBtn        = document.getElementById("uploadBtn");
  const fileInput        = document.getElementById("fileInput");
  const imageGenBtn      = document.getElementById("imageGenBtn");
  const imagePreviewBar  = document.getElementById("imagePreviewBar");
  const previewThumb     = document.getElementById("previewThumb");
  const removeImgBtn     = document.getElementById("removeImgBtn");
  const themeToggle      = document.getElementById("themeToggle");
  const modeBtns         = document.querySelectorAll(".mode-btn");
  const imgModal         = document.getElementById("imgModal");
  const imgModalImg      = document.getElementById("imgModalImg");
  const imgModalClose    = document.getElementById("imgModalClose");
  const imgModalBackdrop = document.getElementById("imgModalBackdrop");
  const suggestionCards  = document.querySelectorAll(".suggestion-card");

  /* ── STATE ────────────────────────────────── */
  
  
  let currentMode        = "instant";
  let currentChatId      = null;
  let chats              = {};          // { id: { title, messages, mode, timestamp } }
  let uploadedImageData  = null;        // base64 string
  let uploadedImageType  = null;        // e.g. "image/jpeg"
  let isImageGenMode     = false;
  let isStreaming        = false;

  /* ── TOAST ────────────────────────────────── */
  const toast = (() => {
    const el = document.createElement("div");
    el.className = "copy-toast";
    document.body.appendChild(el);
    let t;
    return (msg) => {
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(t);
      t = setTimeout(() => el.classList.remove("show"), 2000);
    };
  })();

  /* ── THEME ────────────────────────────────── */
  const storedTheme = localStorage.getItem("maring-theme") || "dark";
  applyTheme(storedTheme);

  themeToggle.addEventListener("change", () => {
    const theme = themeToggle.checked ? "dark" : "light";
    applyTheme(theme);
    localStorage.setItem("maring-theme", theme);
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.checked = theme === "dark";
  }

  /* ── SIDEBAR ──────────────────────────────── */
  function openSidebar() {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("active");
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("active");
  }
  menuBtn.addEventListener("click", openSidebar);
  sidebarClose.addEventListener("click", closeSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);

  /* ── MODE SELECTOR ────────────────────────── */
  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      modeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentMode = btn.dataset.mode;
      if (currentChatId && chats[currentChatId]) {
        chats[currentChatId].mode = currentMode;
        saveChats();
      }
    });
  });

  /* ── IMAGE GEN TOGGLE ─────────────────────── */
  imageGenBtn.addEventListener("click", () => {
    isImageGenMode = !isImageGenMode;
    imageGenBtn.classList.toggle("active", isImageGenMode);
    messageInput.placeholder = isImageGenMode
      ? "Describe an image to generate…"
      : "Message Maring…";
    if (isImageGenMode) toast("🎨 Image generation mode ON");
    else toast("Image generation mode OFF");
  });

  /* ── FILE UPLOAD ──────────────────────────── */
  uploadBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast("Please upload an image file."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target.result;
      uploadedImageData = result.split(",")[1];
      uploadedImageType = file.type;
      previewThumb.src = result;
      imagePreviewBar.style.display = "flex";
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  });

  removeImgBtn.addEventListener("click", () => {
    uploadedImageData = null;
    uploadedImageType = null;
    imagePreviewBar.style.display = "none";
    previewThumb.src = "";
  });

  /* ── TEXTAREA AUTO-RESIZE ─────────────────── */
  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 160) + "px";
    sendBtn.disabled = messageInput.value.trim() === "" && !uploadedImageData;
  });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled && !isStreaming) handleSend();
    }
  });

  sendBtn.addEventListener("click", () => {
    if (!sendBtn.disabled && !isStreaming) handleSend();
  });

  /* ── SUGGESTION CARDS ─────────────────────── */
  suggestionCards.forEach(card => {
    card.addEventListener("click", () => {
      const prompt = card.dataset.prompt;
      // Check if it's an image generation prompt
      if (prompt.toLowerCase().includes("generate an image")) {
        isImageGenMode = true;
        imageGenBtn.classList.add("active");
        messageInput.placeholder = "Describe an image to generate…";
      }
      messageInput.value = prompt;
      messageInput.dispatchEvent(new Event("input"));
      messageInput.focus();
    });
  });

  /* ── CHAT MANAGEMENT ──────────────────────── */
  function loadChats() {
  try {
    const stored = localStorage.getItem("maring-chats");
    const parsed = stored ? JSON.parse(stored) : {};
    // Strip any null/corrupt entries on load
    chats = Object.fromEntries(
      Object.entries(parsed).filter(([_, v]) => v != null && v.timestamp)
    );
  } catch { chats = {}; }
}

  function saveChats() {
    try { localStorage.setItem("maring-chats", JSON.stringify(chats)); } catch {}
  }

  function createChat() {
    const id = "chat_" + Date.now();
    chats[id] = {
      title: "New Chat",
      messages: [],
      mode: currentMode,
      timestamp: Date.now()
    };
    currentChatId = id;
    saveChats();
    renderHistoryList();
    return id;
  }

  function switchChat(id) {
    if (!chats[id]) return;
    currentChatId = id;
    currentMode = chats[id].mode || "instant";
    modeBtns.forEach(b => {
      b.classList.toggle("active", b.dataset.mode === currentMode);
    });
    renderChat();
    renderHistoryList();
    closeSidebar();
  }

  function deleteChat(id) {
    delete chats[id];
    saveChats();
    if (currentChatId === id) {
      currentChatId = null;
      showWelcome();
    }
    renderHistoryList();
  }

  function renderHistoryList() {
  const sortedIds = Object.keys(chats)
    .filter(id => chats[id] != null)
    .sort((a, b) => chats[b].timestamp - chats[a].timestamp);

  if (sortedIds.length === 0) {
    chatHistoryList.innerHTML = '<p class="history-empty">No chats yet</p>';
    return;
  }

  chatHistoryList.innerHTML = sortedIds.map(id => {
    const chat = chats[id];
    const isActive = id === currentChatId;
    return `
      <div class="history-item ${isActive ? "active" : ""}" data-id="${id}">
        <span class="hi-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <span class="hi-text">${escapeHtml(chat.title)}</span>
        <button class="hi-delete" data-id="${id}" title="Delete chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
  }).join("");

  // Events
  chatHistoryList.querySelectorAll(".history-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".hi-delete")) return;
      switchChat(item.dataset.id);
    });
  });
  chatHistoryList.querySelectorAll(".hi-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChat(btn.dataset.id);
    });
  });
}

  newChatBtn.addEventListener("click", () => {
    showWelcome();
    currentChatId = null;
    renderHistoryList();
    closeSidebar();
  });

  /* ── WELCOME / CHAT RENDER ────────────────── */
  function showWelcome() {
    welcomeScreen.style.display = "flex";
    messagesContainer.innerHTML = "";
    messagesContainer.style.display = "none";
    isImageGenMode = false;
    imageGenBtn.classList.remove("active");
    messageInput.placeholder = "Message Maring…";
  }

  function hideWelcome() {
    welcomeScreen.style.display = "none";
    messagesContainer.style.display = "flex";
  }

  function renderChat() {
    if (!currentChatId || !chats[currentChatId]) { showWelcome(); return; }
    hideWelcome();
    messagesContainer.innerHTML = "";
    const msgs = chats[currentChatId].messages;
    msgs.forEach(msg => appendMessageDOM(msg, false));
    scrollToBottom();
  }

  /* ── MESSAGE DOM ──────────────────────────── */
  function appendMessageDOM(msg, animate = true) {
    const row = document.createElement("div");
    row.className = `message-row ${msg.role === "user" ? "user-row" : "ai-row"}`;
    if (!animate) row.style.animation = "none";

    const modeLabel = msg.mode ? `<div class="mode-badge ${msg.mode}">${modeMeta(msg.mode)}</div>` : "";

    if (msg.role === "user") {
      row.innerHTML = `
        <div>
          ${modeLabel}
          <div class="bubble">
            ${msg.image ? `<img src="${msg.image}" alt="Uploaded image" style="margin-bottom:6px;" />` : ""}
            ${msg.text ? `<p>${escapeHtml(msg.text)}</p>` : ""}
          </div>
        </div>
      `;
    } else {
      row.innerHTML = `
        <div class="ai-avatar">${maringAvatar()}</div>
        <div>
          ${modeLabel}
          <div class="bubble">${renderContent(msg.content || msg.text || "")}</div>
          <div class="msg-actions">
            <button class="msg-action-btn copy-btn" title="Copy">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
          </div>
        </div>
      `;
      row.querySelector(".copy-btn")?.addEventListener("click", () => {
        navigator.clipboard?.writeText(msg.content || msg.text || "").then(() => toast("Copied!"));
      });
    }

    // Image click → modal
    row.querySelectorAll("img").forEach(img => {
      img.addEventListener("click", () => openImgModal(img.src));
    });

    messagesContainer.appendChild(row);
    return row;
  }

  function renderContent(text) {
    if (!text) return "";
    // Basic markdown-like rendering
    return text
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^#{1,3} (.+)$/gm, (_, t) => `<strong>${t}</strong>`)
      .replace(/\n/g, "<br>");
  }

  function modeMeta(mode) {
    const map = {
      instant: "⚡ Instant",
      expert: "🧠 Expert",
      pro: "✦ Pro"
    };
    return map[mode] || mode;
  }

  function maringAvatar() {
    return `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="16,2 30,9 30,23 16,30 2,23 2,9" fill="none" stroke="var(--maroon)" stroke-width="1.4"/>
      <polygon points="16,7 25,12 25,21 16,26 7,21 7,12" fill="var(--maroon)" opacity="0.13"/>
      <text x="16" y="21" text-anchor="middle" fill="var(--maroon)" font-size="11" font-family="Cinzel" font-weight="700">M</text>
    </svg>`;
  }

  /* ── SEND HANDLER ─────────────────────────── */
  async function handleSend() {
    const text = messageInput.value.trim();
    if (!text && !uploadedImageData) return;
    if (isStreaming) return;

    // Create chat if needed
    if (!currentChatId) createChat();
    hideWelcome();

    const imgData = uploadedImageData;
    const imgType = uploadedImageType;
    const imgDataUrl = imgData ? `data:${imgType};base64,${imgData}` : null;

    // User message
    const userMsg = {
      role: "user",
      text,
      image: imgDataUrl,
      mode: currentMode,
      timestamp: Date.now()
    };
    chats[currentChatId].messages.push(userMsg);
    if (chats[currentChatId].messages.length === 1) {
      chats[currentChatId].title = text.slice(0, 40) || "Image Chat";
    }
    saveChats();

    appendMessageDOM(userMsg);
    scrollToBottom();

    // Reset input
    messageInput.value = "";
    messageInput.style.height = "auto";
    sendBtn.disabled = true;
    uploadedImageData = null;
    uploadedImageType = null;
    imagePreviewBar.style.display = "none";
    previewThumb.src = "";

    renderHistoryList();

    if (isImageGenMode) {
      await handleImageGeneration(text);
    } else {
      await handleTextGeneration(text, imgData, imgType);
    }
  }

  /* ── TEXT GENERATION ──────────────────────── */
  async function handleTextGeneration(text, imgData, imgType) {
    isStreaming = true;

    const typingRow = document.createElement("div");
    typingRow.className = "message-row ai-row";
    typingRow.innerHTML = `
      <div class="ai-avatar">${maringAvatar()}</div>
      <div class="bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    messagesContainer.appendChild(typingRow);
    scrollToBottom();

    try {
      const systemPrompt = getSystemPrompt(currentMode);
      const contents = buildGeminiMessages(imgData, imgType, text, systemPrompt);
      const maxTokens = currentMode === "pro" ? 4096 : currentMode === "expert" ? 2048 : 1024;

      const response = await fetch(
        `/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: { maxOutputTokens: maxTokens }
          })
        }
      );

      typingRow.remove();

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";

      const aiMsg = {
        role: "assistant",
        content,
        mode: currentMode,
        timestamp: Date.now()
      };
      chats[currentChatId].messages.push(aiMsg);
      chats[currentChatId].timestamp = Date.now();
      saveChats();

      appendMessageDOM(aiMsg);
      scrollToBottom();

    } catch (err) {
      typingRow.remove();
      const errMsg = {
        role: "assistant",
        content: `⚠️ Error: ${err.message}\n\nPlease check your API key.`,
        mode: currentMode,
        timestamp: Date.now()
      };
      chats[currentChatId].messages.push(errMsg);
      saveChats();
      appendMessageDOM(errMsg);
      scrollToBottom();
    }

    isStreaming = false;
  }

  function buildGeminiMessages(imgData, imgType, text, systemPrompt) {
    const chat = chats[currentChatId];
    const history = chat.messages.slice(0, -1);
    const contents = [];

    // Inject system prompt as first user/model exchange
    contents.push({ role: "user", parts: [{ text: systemPrompt }] });
    contents.push({ role: "model", parts: [{ text: "Understood. I will follow these instructions." }] });

    // Conversation history (last 20 messages)
    history.slice(-20).forEach(m => {
      if (m.role === "user") {
        const parts = [];
        if (m.image) {
          const base64 = m.image.split(",")[1];
          const mtype = m.image.split(";")[0].split(":")[1];
          parts.push({ inline_data: { mime_type: mtype, data: base64 } });
        }
        if (m.text) parts.push({ text: m.text });
        contents.push({ role: "user", parts });
      } else {
        contents.push({ role: "model", parts: [{ text: m.content || "" }] });
      }
    });

    // Current message
    const parts = [];
    if (imgData) parts.push({ inline_data: { mime_type: imgType, data: imgData } });
    if (text) parts.push({ text });
    contents.push({ role: "user", parts });

    return contents;
  }

  function getSystemPrompt(mode) {
    const base = "You are Maring, a sophisticated and intelligent AI assistant. You are knowledgeable, helpful, and articulate. You provide clear, well-structured responses.";
    if (mode === "instant") return base + " Be concise and direct. Prioritize speed and clarity.";
    if (mode === "expert") return base + " Be thorough and detailed. Provide comprehensive explanations with examples where helpful.";
    if (mode === "pro") return base + " Provide the most in-depth, nuanced, and expert-level response possible. Consider multiple perspectives, edge cases, and provide professional-grade analysis.";
    return base;
  }

  /* ── IMAGE GENERATION ─────────────────────── */
  async function handleImageGeneration(prompt) {
    isStreaming = true;

    // Gen indicator row
    const genRow = document.createElement("div");
    genRow.className = "message-row ai-row";
    genRow.innerHTML = `
      <div class="ai-avatar">${maringAvatar()}</div>
      <div class="bubble">
        <div class="img-gen-indicator">
          <span>Generating image…</span>
          <div class="img-gen-bar"><div class="img-gen-bar-fill"></div></div>
        </div>
      </div>
    `;
    messagesContainer.appendChild(genRow);
    scrollToBottom();

    try {
      // Use Claude to get a creative description, then display a placeholder image
      // Since direct image gen API isn't available in the browser, we'll use
      // a creative prompt enhancement + placeholder approach
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [{ text: `I want to generate an image with this description: "${prompt}". 
              Provide a very vivid, detailed description of what this image would look like, as if you're describing it to an artist. 
              Then create an SVG representation of the scene using simple shapes and colors. 
              Respond in this exact format:
              DESCRIPTION: [vivid description]
              SVG: [complete SVG code starting with <svg and ending with </svg>]` }]
            }],
            generationConfig: { maxOutputTokens: 1000 }
          })
        }
      );

      genRow.remove();

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rawText = data.content?.[0]?.text || "";

      const descMatch = rawText.match(/DESCRIPTION:\s*([\s\S]*?)(?=SVG:|$)/i);
      const svgMatch = rawText.match(/<svg[\s\S]*?<\/svg>/i);

      const description = descMatch ? descMatch[1].trim() : "Generated image";
      const svgCode = svgMatch ? svgMatch[0] : null;

      let contentHtml = `<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:10px;">${escapeHtml(description)}</p>`;

      if (svgCode) {
        const blob = new Blob([svgCode], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        contentHtml += `<img src="${url}" alt="${escapeHtml(prompt)}" style="max-width:100%;border-radius:10px;cursor:pointer;" />`;
      } else {
        // Fallback: styled placeholder
        contentHtml += `
          <div style="background:linear-gradient(135deg,#2a0505,#1a0a0a);border-radius:10px;padding:32px;text-align:center;border:1px solid var(--maroon);">
            <div style="font-size:2.5rem;margin-bottom:10px;">🎨</div>
            <p style="color:var(--maroon-light);font-family:'Cinzel',serif;font-size:0.9rem;">${escapeHtml(prompt)}</p>
            <p style="color:var(--text-muted);font-size:0.75rem;margin-top:8px;">Image generation preview</p>
          </div>
        `;
      }

      const aiMsg = {
        role: "assistant",
        content: description,
        contentHtml,
        mode: currentMode,
        timestamp: Date.now(),
        isImageGen: true
      };
      chats[currentChatId].messages.push(aiMsg);
      saveChats();

      // Custom render for image gen
      const row = document.createElement("div");
      row.className = "message-row ai-row";
      row.innerHTML = `
        <div class="ai-avatar">${maringAvatar()}</div>
        <div>
          <div class="mode-badge pro">🎨 Image Gen</div>
          <div class="bubble">${contentHtml}</div>
        </div>
      `;
      row.querySelectorAll("img").forEach(img => {
        img.addEventListener("click", () => openImgModal(img.src));
      });
      messagesContainer.appendChild(row);
      scrollToBottom();

    } catch (err) {
      genRow.remove();
      const errMsg = {
        role: "assistant",
        content: `⚠️ Image generation error: ${err.message}`,
        mode: currentMode,
        timestamp: Date.now()
      };
      chats[currentChatId].messages.push(errMsg);
      saveChats();
      appendMessageDOM(errMsg);
      scrollToBottom();
    }

    isStreaming = false;
  }

  /* ── IMAGE MODAL ──────────────────────────── */
  function openImgModal(src) {
    imgModalImg.src = src;
    imgModal.style.display = "flex";
    document.body.style.overflow = "hidden";
  }
  function closeImgModal() {
    imgModal.style.display = "none";
    document.body.style.overflow = "";
  }
  imgModalClose.addEventListener("click", closeImgModal);
  imgModalBackdrop.addEventListener("click", closeImgModal);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeImgModal(); });

  /* ── UTILS ────────────────────────────────── */
  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ── INIT ─────────────────────────────────── */
  function init() {
    loadChats();
    renderHistoryList();
    showWelcome();
  }

  init();

})();
