(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const body = document.body;
  const cinematicLayer = document.querySelector("#cinematic-layer");
  const startScreen = document.querySelector("#start-screen");
  const gameScreen = document.querySelector("#game-screen");
  const board = document.querySelector(".board-panel");
  const playerPanel = document.querySelector(".player-panel");
  const resultBanner = document.querySelector("#result-banner");
  const handCards = document.querySelector("#hand-cards");
  const roundCommitments = document.querySelector("#round-commitments");
  const cardMotionLayer = document.querySelector("#card-motion-layer");
  const startForm = document.querySelector("#start-form");

  let pointerFrame = 0;
  let lastHandSignature = "";
  let lastBannerText = resultBanner?.textContent || "";
  let wasGameMode = false;

  function syncMode() {
    const gameMode = Boolean(gameScreen && !gameScreen.classList.contains("hidden"));
    body.classList.toggle("game-mode", gameMode);
    body.classList.toggle("start-mode", !gameMode);

    if (gameMode && !wasGameMode && !reducedMotion) {
      requestAnimationFrame(() => {
        stageGameEntrance();
        impactAt(window.innerWidth * 0.5, window.innerHeight * 0.42, 14);
      });
    }

    if (!gameMode) {
      body.classList.remove("launching");
    }

    wasGameMode = gameMode;
  }

  function stageGameEntrance() {
    const pieces = [
      ...document.querySelectorAll(".status-pill"),
      ...document.querySelectorAll(".seat-card"),
      board,
      playerPanel,
      document.querySelector(".log-panel"),
    ].filter(Boolean);

    pieces.forEach((element, index) => {
      element.animate(
        [
          { opacity: 0, transform: `translateY(${18 + index * 2}px) scale(.96)`, filter: "blur(8px)" },
          { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
        ],
        {
          duration: 620 + index * 55,
          delay: index * 65,
          easing: "cubic-bezier(.16,1,.3,1)",
          fill: "both",
        }
      );
    });
  }

  function onPointerMove(event) {
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      root.style.setProperty("--pointer-x", `${event.clientX}px`);
      root.style.setProperty("--pointer-y", `${event.clientY}px`);

      if (board) {
        const rect = board.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
        const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
        board.style.setProperty("--arena-x", `${Math.max(0, Math.min(100, x))}%`);
        board.style.setProperty("--arena-y", `${Math.max(0, Math.min(100, y))}%`);
      }

      if (playerPanel) {
        const rect = playerPanel.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
        playerPanel.style.setProperty("--hand-x", `${Math.max(0, Math.min(100, x))}%`);
      }
    });
  }

  function updateCardTilt(event) {
    const tile = event.target.closest(".card-tile");
    if (!tile || reducedMotion) return;
    const rect = tile.getBoundingClientRect();
    const px = (event.clientX - rect.left) / Math.max(1, rect.width);
    const py = (event.clientY - rect.top) / Math.max(1, rect.height);
    tile.style.setProperty("--card-ry", `${(px - 0.5) * 14}deg`);
    tile.style.setProperty("--card-rx", `${(0.5 - py) * 12}deg`);
  }

  function resetCardTilt(event) {
    const tile = event.target.closest(".card-tile");
    if (!tile || (event.relatedTarget && tile.contains(event.relatedTarget))) return;
    tile.style.setProperty("--card-ry", "0deg");
    tile.style.setProperty("--card-rx", "0deg");
  }

  function addButtonRipple(event) {
    const button = event.target.closest("button");
    if (!button || button.disabled || reducedMotion) return;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "button-ripple";
    ripple.style.left = `${event.clientX - rect.left}px`;
    ripple.style.top = `${event.clientY - rect.top}px`;
    button.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  }

  function addSelectionFlare(event) {
    if (!event.target.closest(".card-tile") || reducedMotion) return;
    const flare = document.createElement("span");
    flare.className = "selection-flare";
    flare.style.setProperty("--impact-x", `${event.clientX}px`);
    flare.style.setProperty("--impact-y", `${event.clientY}px`);
    cinematicLayer?.appendChild(flare);
    flare.addEventListener("animationend", () => flare.remove(), { once: true });
  }

  function impactAt(x, y, particleCount = 10) {
    if (!cinematicLayer || reducedMotion) return;

    const wave = document.createElement("span");
    wave.className = "impact-wave";
    wave.style.setProperty("--impact-x", `${x}px`);
    wave.style.setProperty("--impact-y", `${y}px`);
    cinematicLayer.appendChild(wave);
    wave.addEventListener("animationend", () => wave.remove(), { once: true });

    for (let index = 0; index < particleCount; index += 1) {
      const angle = (Math.PI * 2 * index) / particleCount + Math.random() * 0.35;
      const distance = 42 + Math.random() * 110;
      const particle = document.createElement("span");
      particle.className = "kinetic-particle";
      particle.style.setProperty("--impact-x", `${x}px`);
      particle.style.setProperty("--impact-y", `${y}px`);
      particle.style.setProperty("--particle-x", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--particle-y", `${Math.sin(angle) * distance}px`);
      particle.style.setProperty("--particle-size", `${2 + Math.random() * 4}px`);
      particle.style.setProperty("--particle-duration", `${540 + Math.random() * 420}ms`);
      particle.style.setProperty("--particle-color", index % 3 === 0 ? "#fff9ef" : "#ff5478");
      cinematicLayer.appendChild(particle);
      particle.addEventListener("animationend", () => particle.remove(), { once: true });
    }
  }

  function hitArena() {
    if (!board || reducedMotion) return;
    board.classList.remove("phase-impact");
    void board.offsetWidth;
    board.classList.add("phase-impact");
    board.addEventListener("animationend", () => board.classList.remove("phase-impact"), { once: true });

    if (resultBanner) {
      resultBanner.classList.remove("banner-impact");
      void resultBanner.offsetWidth;
      resultBanner.classList.add("banner-impact");
      resultBanner.addEventListener("animationend", () => resultBanner.classList.remove("banner-impact"), { once: true });
    }

    const rect = board.getBoundingClientRect();
    impactAt(rect.left + rect.width * 0.5, rect.top + rect.height * 0.52, 16);
  }

  function animateHandIfChanged() {
    if (!handCards || reducedMotion) return;
    const cards = [...handCards.querySelectorAll(".card-tile[data-hand-card-id]")];
    const signature = cards.map((card) => card.dataset.handCardId).join("|");
    if (!signature || signature === lastHandSignature) return;
    lastHandSignature = signature;

    cards.forEach((card, index) => {
      card.animate(
        [
          { opacity: 0, transform: `perspective(850px) translate3d(${50 + index * 8}px, 70px, -120px) rotateY(-32deg) rotateZ(${8 - index * 2}deg)` },
          { opacity: 1, transform: "perspective(850px) translate3d(0,0,0) rotateY(0) rotateZ(0)" },
        ],
        {
          duration: 720,
          delay: 80 + index * 82,
          easing: "cubic-bezier(.12,.82,.2,1.12)",
          fill: "both",
        }
      );
    });
  }

  function animateRoundBoard() {
    if (!roundCommitments || reducedMotion) return;
    const entries = [...roundCommitments.querySelectorAll(".round-entry")];
    entries.forEach((entry, index) => {
      entry.animate(
        [
          { opacity: 0.2, transform: "translateY(12px) scale(.94)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ],
        { duration: 420, delay: index * 55, easing: "cubic-bezier(.16,1,.3,1)" }
      );
    });
  }

  function markMotionGhosts() {
    cardMotionLayer?.querySelectorAll(".card-motion-ghost").forEach((ghost) => {
      ghost.classList.add("cinematic-motion");
    });
  }

  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointermove", updateCardTilt, { passive: true });
  document.addEventListener("pointerout", resetCardTilt, { passive: true });
  document.addEventListener("pointerdown", addButtonRipple, { passive: true });
  document.addEventListener("click", addSelectionFlare, true);

  startForm?.addEventListener("submit", () => {
    if (!reducedMotion) body.classList.add("launching");
  });

  if (startScreen && gameScreen) {
    new MutationObserver(syncMode).observe(gameScreen, { attributes: true, attributeFilter: ["class"] });
  }

  if (resultBanner) {
    new MutationObserver(() => {
      const nextText = resultBanner.textContent || "";
      if (nextText && nextText !== lastBannerText) {
        lastBannerText = nextText;
        hitArena();
      }
    }).observe(resultBanner, { childList: true, characterData: true, subtree: true });
  }

  if (handCards) {
    new MutationObserver(animateHandIfChanged).observe(handCards, { childList: true });
  }

  if (roundCommitments) {
    new MutationObserver(animateRoundBoard).observe(roundCommitments, { childList: true });
  }

  if (cardMotionLayer) {
    new MutationObserver(markMotionGhosts).observe(cardMotionLayer, { childList: true });
  }

  syncMode();
  animateHandIfChanged();
})();
