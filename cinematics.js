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
  let tooltipElement = null;
  let tooltipAnchor = null;
  let tooltipPinned = false;
  let tooltipHideTimer = 0;
  let phaseAnnouncer = null;

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

  function ensureTooltip() {
    if (tooltipElement) return tooltipElement;
    tooltipElement = document.createElement("div");
    tooltipElement.className = "card-info-popover";
    tooltipElement.setAttribute("role", "tooltip");
    tooltipElement.setAttribute("aria-live", "polite");
    cinematicLayer?.appendChild(tooltipElement);
    return tooltipElement;
  }

  function prepareTooltipTargets(scope = document) {
    scope.querySelectorAll?.("[data-tooltip]").forEach((target) => {
      const nativeTitle = target.getAttribute("title");
      if (nativeTitle) {
        target.setAttribute("aria-label", nativeTitle);
        target.removeAttribute("title");
      }
    });
  }

  function positionTooltip(anchorRect) {
    if (!tooltipElement || !anchorRect) return;
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const gutter = 12;
    const roomAbove = anchorRect.top - tooltipRect.height - 16;
    const placeBelow = roomAbove < gutter;
    const desiredLeft = anchorRect.left + anchorRect.width * 0.5 - tooltipRect.width * 0.5;
    const left = Math.max(gutter, Math.min(window.innerWidth - tooltipRect.width - gutter, desiredLeft));
    const top = placeBelow
      ? Math.min(window.innerHeight - tooltipRect.height - gutter, anchorRect.bottom + 16)
      : roomAbove;

    tooltipElement.dataset.placement = placeBelow ? "below" : "above";
    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${Math.max(gutter, top)}px`;
    tooltipElement.style.setProperty(
      "--tooltip-arrow-x",
      `${Math.max(18, Math.min(tooltipRect.width - 18, anchorRect.left + anchorRect.width * 0.5 - left))}px`
    );
  }

  function showTooltip(target, { pinned = false } = {}) {
    const copy = target?.dataset?.tooltip;
    if (!copy || !cinematicLayer) return;
    window.clearTimeout(tooltipHideTimer);
    tooltipAnchor = target;
    tooltipPinned = pinned;
    const anchorRect = target.getBoundingClientRect();
    const tooltip = ensureTooltip();
    tooltip.textContent = copy;
    tooltip.classList.add("visible");
    requestAnimationFrame(() => positionTooltip(anchorRect));

    if (pinned) {
      tooltipHideTimer = window.setTimeout(() => hideTooltip(true), 3600);
    }
  }

  function hideTooltip(force = false) {
    if (tooltipPinned && !force) return;
    window.clearTimeout(tooltipHideTimer);
    tooltipPinned = false;
    tooltipAnchor = null;
    tooltipElement?.classList.remove("visible");
  }

  function handleTooltipOver(event) {
    const target = event.target.closest?.("[data-tooltip]");
    if (!target) return;
    showTooltip(target);
  }

  function handleTooltipOut(event) {
    const target = event.target.closest?.("[data-tooltip]");
    if (!target || target.contains(event.relatedTarget)) return;
    tooltipHideTimer = window.setTimeout(() => hideTooltip(), 120);
  }

  function handleTooltipPress(event) {
    const target = event.target.closest?.("[data-tooltip]");
    if (target) {
      showTooltip(target, { pinned: true });
    } else {
      hideTooltip(true);
    }
  }

  function announcePhase(text) {
    if (!text || /choose cards/i.test(text) || reducedMotion || !cinematicLayer) return;
    phaseAnnouncer?.remove();

    let headline = text;
    let kicker = "TABLE IN MOTION";
    if (/reveal supports/i.test(text)) {
      headline = "Supports up";
      kicker = "Effects are public";
    } else if (/reveal attacks/i.test(text)) {
      headline = "Attacks flip";
      kicker = "No more hiding";
    } else if (/wins the round/i.test(text)) {
      kicker = "Round decided";
    } else if (/plunder/i.test(text)) {
      kicker = "Winner's choice";
    }

    phaseAnnouncer = document.createElement("div");
    phaseAnnouncer.className = "phase-announcer";
    const kickerElement = document.createElement("span");
    const headlineElement = document.createElement("strong");
    kickerElement.textContent = kicker;
    headlineElement.textContent = headline;
    phaseAnnouncer.append(kickerElement, headlineElement);
    cinematicLayer.appendChild(phaseAnnouncer);
    phaseAnnouncer.addEventListener("animationend", () => {
      phaseAnnouncer?.remove();
      phaseAnnouncer = null;
    }, { once: true });
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
    prepareTooltipTargets(handCards);
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
  document.addEventListener("pointerover", handleTooltipOver, { passive: true });
  document.addEventListener("pointerout", handleTooltipOut, { passive: true });
  document.addEventListener("pointerdown", handleTooltipPress, true);
  document.addEventListener("contextmenu", handleTooltipPress, true);
  document.addEventListener("focusin", handleTooltipOver);
  document.addEventListener("focusout", handleTooltipOut);
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
        hideTooltip(true);
        announcePhase(nextText);
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
  prepareTooltipTargets();
  animateHandIfChanged();
})();
