(function () {
  const AI_NAMES = ["Mira", "Drake", "Petra", "Callum", "Vivienne", "Jasper"];

  const SUITS = [
    { key: "hearts", label: "Hearts", symbol: "♥", color: "red", order: 4 },
    { key: "diamonds", label: "Diamonds", symbol: "♦", color: "red", order: 3 },
    { key: "spades", label: "Spades", symbol: "♠", color: "black", order: 2 },
    { key: "clubs", label: "Clubs", symbol: "♣", color: "black", order: 1 },
  ];

  const RANKS = [
    { rank: "2", value: 2 },
    { rank: "3", value: 3 },
    { rank: "4", value: 4 },
    { rank: "5", value: 5 },
    { rank: "6", value: 6 },
    { rank: "7", value: 7 },
    { rank: "8", value: 8 },
    { rank: "9", value: 9 },
    { rank: "10", value: 10 },
    { rank: "J", value: 11 },
    { rank: "Q", value: 12 },
    { rank: "K", value: 13 },
    { rank: "A", value: 14 },
  ];

  const MAX_RANK_VALUE = RANKS[RANKS.length - 1].value;
  const RANK_LABEL_BY_VALUE = new Map(RANKS.map(({ rank, value }) => [value, rank]));
  const SPECIAL_RANKS = new Set(["2", "7", "8", "J", "Q", "K", "A"]);
  const WILD_8_MODES = ["rank-match", "suit-match"];
  const STARTING_HAND_SIZE = { 2: 7, 3: 7, 4: 5 };
  const PHASE_LABELS = {
    start: "Start",
    choose: "Choose cards",
    revealSupports: "Reveal supports",
    revealAttacks: "Reveal attacks",
    resolve: "Resolve",
    cleanup: "Cleanup",
    nextRound: "Next round",
    gameOver: "Game over",
  };

  const state = {
    gameStarted: false,
    roundNumber: 1,
    phase: "start",
    playerCount: 4,
    players: [],
    deck: [],
    bottomDeckBuffer: [],
    prizeCards: [],
    effectPile: [],
    jailDeck: [],
    roundPlays: {},
    winnerPlayerId: null,
    eventLog: [],
    gameOver: false,
    finalScore: null,
    rulesOpen: false,
    pendingPlunderChoice: null,
    selectedPlunderCardId: null,
    scheduledActions: [],
    scheduledActionSeq: 0,
    nowMs: 0,
    lastFrameTs: null,
    automationMode: false,
    aiTurnsScheduled: false,
    renderTick: 0,
    focusedHandIndex: 0,
    focusedTargetIndex: 0,
    focusedPlunderIndex: 0,
    draggedHandCardId: null,
    revealPulsePlayerIds: [],
    winnerPulsePlayerId: null,
  };

  const refs = {
    startScreen: document.querySelector("#start-screen"),
    gameScreen: document.querySelector("#game-screen"),
    startForm: document.querySelector("#start-form"),
    playerName: document.querySelector("#player-name"),
    playerCount: document.querySelector("#player-count"),
    statusBar: document.querySelector("#status-bar"),
    mainDeckCount: document.querySelector("#main-deck-count"),
    effectsDeckCount: document.querySelector("#effects-deck-count"),
    jailDeckCount: document.querySelector("#jail-deck-count"),
    prizeCards: document.querySelector("#prize-cards"),
    roundCommitments: document.querySelector("#round-commitments"),
    northSeat: document.querySelector("#north-seat"),
    westSeat: document.querySelector("#west-seat"),
    eastSeat: document.querySelector("#east-seat"),
    playerSummary: document.querySelector("#player-summary"),
    supportTargetPanel: document.querySelector("#support-target-panel"),
    validationMessage: document.querySelector("#validation-message"),
    playerHandStage: document.querySelector(".player-hand-stage"),
    handCards: document.querySelector("#hand-cards"),
    swapPreview: document.querySelector("#swap-preview"),
    reserveSummary: document.querySelector("#reserve-summary"),
    reserveCards: document.querySelector("#reserve-cards"),
    eventLog: document.querySelector("#event-log"),
    cardMotionLayer: document.querySelector("#card-motion-layer"),
    resultBanner: document.querySelector("#result-banner"),
    drawCardButton: document.querySelector("#draw-card"),
    rulesToggle: document.querySelector("#rules-toggle"),
    rulesClose: document.querySelector("#rules-close"),
    rulesModal: document.querySelector("#rules-modal"),
    rulesContent: document.querySelector("#rules-content"),
    lockInButton: document.querySelector("#lock-in"),
    clearSelectionButton: document.querySelector("#clear-selection"),
    restartButton: document.querySelector("#restart-button"),
    plunderModal: document.querySelector("#plunder-modal"),
    plunderDescription: document.querySelector("#plunder-description"),
    plunderOptions: document.querySelector("#plunder-options"),
    plunderConfirm: document.querySelector("#plunder-confirm"),
    endgameModal: document.querySelector("#endgame-modal"),
    endgameTitle: document.querySelector("#endgame-title"),
    endgameCopy: document.querySelector("#endgame-copy"),
    endgameScoreboard: document.querySelector("#endgame-scoreboard"),
    playAgain: document.querySelector("#play-again"),
  };

  const motionState = {
    pending: [],
    sequence: 0,
    rafHandle: null,
    timers: [],
  };

  init();

  function init() {
    refs.startForm.addEventListener("submit", handleStartSubmit);
    refs.rulesToggle.addEventListener("click", () => toggleRules(true));
    refs.rulesClose.addEventListener("click", () => toggleRules(false));
    refs.restartButton.addEventListener("click", resetToStartScreen);
    refs.clearSelectionButton.addEventListener("click", clearHumanSelections);
    refs.drawCardButton.addEventListener("click", drawForHumanPlayer);
    refs.lockInButton.addEventListener("click", lockInHumanPlay);
    refs.handCards.addEventListener("click", handleHandCardClick);
    refs.handCards.addEventListener("contextmenu", handleHandCardContextMenu);
    refs.reserveCards.addEventListener("click", handleReserveCardClick);
    refs.supportTargetPanel.addEventListener("click", handleSupportTargetClick);
    refs.plunderOptions.addEventListener("click", handlePlunderOptionClick);
    refs.plunderConfirm.addEventListener("click", confirmHumanPlunder);
    refs.playAgain.addEventListener("click", resetToStartScreen);
    document.addEventListener("keydown", handleKeydown);

    refs.rulesContent.innerHTML = buildRulesMarkup();
    window.render_game_to_text = renderGameToText;
    window.advanceTime = (ms) => {
      state.automationMode = true;
      advanceGameTime(ms);
      render();
    };

    requestAnimationFrame(tick);
    render();
  }

  function tick(now) {
    if (state.lastFrameTs == null) {
      state.lastFrameTs = now;
    }

    if (!state.automationMode) {
      const delta = Math.min(100, now - state.lastFrameTs);
      if (delta > 0) {
        advanceGameTime(delta);
      }
    }

    state.lastFrameTs = now;
    requestAnimationFrame(tick);
  }

  function handleStartSubmit(event) {
    event.preventDefault();

    const humanName = sanitizePlayerName(refs.playerName.value);
    const playerCount = Number(refs.playerCount.value || "4");
    startGame(humanName, playerCount);
  }

  function handleKeydown(event) {
    if (event.key.toLowerCase() === "f") {
      toggleFullscreen();
      return;
    }

    if (!state.gameStarted) {
      return;
    }

    if (state.pendingPlunderChoice) {
      handlePlunderKeyboard(event);
      return;
    }

    if (state.phase === "choose") {
      handleChooseKeyboard(event);
    }
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  }

  function handleHandCardClick(event) {
    const cardTile = event.target.closest("[data-hand-card-id]");
    if (!cardTile) {
      return;
    }

    const cardId = cardTile.dataset.handCardId;
    const role = event.shiftKey ? "swap" : "attack";
    selectHumanCard(cardId, role);
  }

  function handleHandCardContextMenu(event) {
    const cardTile = event.target.closest("[data-hand-card-id]");
    if (!cardTile) {
      return;
    }

    event.preventDefault();
    selectHumanCard(cardTile.dataset.handCardId, "support");
  }

  function handleHandCardDragStart(event) {
    const cardTile = event.target.closest("[data-hand-card-id]");
    const human = getHumanPlayer();
    if (!cardTile || !human || human.lockedIn || state.phase !== "choose") {
      event.preventDefault();
      return;
    }

    state.draggedHandCardId = cardTile.dataset.handCardId;
    cardTile.classList.add("dragging");
    updateSelectionDropTargets(state.draggedHandCardId, null);

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state.draggedHandCardId);
    }
  }

  function handleHandCardDragEnd(event) {
    const cardTile = event.target.closest("[data-hand-card-id]");
    if (cardTile) {
      cardTile.classList.remove("dragging");
    }

    state.draggedHandCardId = null;
    state.revealPulsePlayerIds = [];
    state.winnerPulsePlayerId = null;
    updateSelectionDropTargets(null, null);
  }

  function handleSelectionSummaryDragOver(event) {
    const socket = event.target.closest("[data-drop-role]");
    const cardId = getDraggedHandCardId(event);
    const role = socket?.dataset.dropRole || null;

    if (!cardId) {
      return;
    }

    if (!role || !canHumanCardFillRole(cardId, role)) {
      updateSelectionDropTargets(cardId, null);
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    updateSelectionDropTargets(cardId, role);
  }

  function handleSelectionSummaryDrop(event) {
    const socket = event.target.closest("[data-drop-role]");
    const cardId = getDraggedHandCardId(event);
    const role = socket?.dataset.dropRole || null;

    event.preventDefault();
    if (!cardId || !role || !canHumanCardFillRole(cardId, role)) {
      updateSelectionDropTargets(null, null);
      state.draggedHandCardId = null;
      return;
    }

    updateSelectionDropTargets(null, null);
    state.draggedHandCardId = null;
    selectHumanCard(cardId, role);
  }

  function handleSelectionSummaryDragLeave(event) {
    const nextTarget = event.relatedTarget;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }

    updateSelectionDropTargets(state.draggedHandCardId, null);
  }

  function handleReserveCardClick(event) {
    const pile = event.target.closest("[data-reserve-action='draw']");
    if (!pile) {
      return;
    }

    drawReserveForHumanPlayer();
  }

  function handleSupportTargetClick(event) {
    const targetButton = event.target.closest("button[data-target-player-id]");
    const wild8Button = event.target.closest("button[data-wild8-mode]");
    if (!targetButton && !wild8Button) {
      return;
    }

    const human = getHumanPlayer();
    if (!human || human.lockedIn || state.phase !== "choose") {
      return;
    }

    if (targetButton) {
      human.selectedSupportTargetPlayerId = targetButton.dataset.targetPlayerId;
    }

    if (wild8Button) {
      selectHumanWild8Mode(wild8Button.dataset.wild8Mode);
      return;
    }

    render();
  }

  function handlePlunderOptionClick(event) {
    const button = event.target.closest("button[data-plunder-card-id]");
    if (!button || !state.pendingPlunderChoice) {
      return;
    }

    state.selectedPlunderCardId = button.dataset.plunderCardId;
    render();
  }

  function sanitizePlayerName(rawName) {
    const trimmed = (rawName || "").trim().slice(0, 20);
    return trimmed || "Player";
  }

  function startGame(humanName, playerCount) {
    const players = [
      createPlayer("p1", humanName, "human"),
      ...Array.from({ length: playerCount - 1 }, (_, index) =>
        createPlayer(`p${index + 2}`, AI_NAMES[index % AI_NAMES.length], "ai")
      ),
    ];

    state.gameStarted = true;
    state.roundNumber = 1;
    state.phase = "choose";
    state.playerCount = playerCount;
    state.players = players;
    state.deck = shuffleDeck(createDeck());
    state.bottomDeckBuffer = [];
    state.prizeCards = [];
    state.effectPile = [];
    state.jailDeck = [];
    state.roundPlays = {};
    state.winnerPlayerId = null;
    state.eventLog = [];
    state.gameOver = false;
    state.finalScore = null;
    state.rulesOpen = false;
    state.pendingPlunderChoice = null;
    state.selectedPlunderCardId = null;
    state.scheduledActions = [];
    state.scheduledActionSeq = 0;
    state.nowMs = 0;
    state.lastFrameTs = null;
    state.automationMode = false;
    state.aiTurnsScheduled = false;
    state.focusedHandIndex = 0;
    state.focusedTargetIndex = 0;
    state.focusedPlunderIndex = 0;
    state.draggedHandCardId = null;
    state.revealPulsePlayerIds = [];
    state.winnerPulsePlayerId = null;

    const handSize = STARTING_HAND_SIZE[playerCount];
    dealHands(state.deck, players, handSize);

    const initialPrizeA = drawCard();
    const initialPrizeB = drawCard();

    if (!initialPrizeA || !initialPrizeB) {
      finishGame("The deck could not reveal the initial prize pair.");
      render();
      return;
    }

    state.prizeCards = [initialPrizeA, initialPrizeB];
    resetRoundPlays();

    addLog("setup", `Players seated: ${players.map((player) => player.name).join(", ")}.`);
    addLog("setup", `Starting hand size: ${handSize} cards each.`);
    addLog("setup", `Prize cards revealed: ${formatCard(initialPrizeA)} and ${formatCard(initialPrizeB)}.`);
    addLog("round", `Round 1 begins.`);

    prepareRound();
    scheduleAction(80, animateShuffleDeck);
    scheduleAction(1080, animateOpeningDeal);
    render();
  }

  function createPlayer(id, name, type) {
    return {
      id,
      name,
      type,
      hand: [],
      reserve: [],
      handCountAtRoundStart: 0,
      ownedCountAtRoundStart: 0,
      reserveDrawEligibleThisRound: false,
      drawsUsed: 0,
      lockedIn: false,
      selectedAttackCardId: null,
      selectedSupportCardId: null,
      selectedWild8Mode: null,
      selectedSwapCardId: null,
      selectedSupportTargetPlayerId: null,
      committedAttackCard: null,
      committedSupportCard: null,
      committedSwapCard: null,
      swapsUsed: 0,
      wonLastRound: false,
    };
  }

  function createDeck() {
    const deck = [];
    let serial = 1;

    for (const suit of SUITS) {
      for (const rankEntry of RANKS) {
        deck.push({
          id: `${suit.key}-${rankEntry.rank}-${serial}`,
          rank: rankEntry.rank,
          rankValue: rankEntry.value,
          suit: suit.key,
          suitLabel: suit.label,
          suitSymbol: suit.symbol,
          color: suit.color,
          isSpecial: SPECIAL_RANKS.has(rankEntry.rank),
          label: `${rankEntry.rank}${suit.symbol}`,
        });
        serial += 1;
      }
    }

    return deck;
  }

  function shuffleDeck(deck) {
    const clone = [...deck];

    for (let index = clone.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
    }

    return clone;
  }

  function dealHands(deck, players, handSize) {
    for (let dealRound = 0; dealRound < handSize; dealRound += 1) {
      for (const player of players) {
        const card = deck.pop();
        if (card) {
          player.hand.push(card);
        }
      }
    }
  }

  function animateShuffleDeck() {
    const deckEl = document.querySelector("[data-motion-anchor=\"main-deck\"]");
    if (!deckEl) return;
    const rect = deckEl.getBoundingClientRect();
    const layer = refs.cardMotionLayer;
    const cardBack = `<div class="card-motion-card card-back">G8</div>`;

    // Two riffle passes, each with a left-pile and right-pile fan then merge
    const riffles = 2;
    const cardsPerPile = 5;
    const riffleSpacing = 380;
    const passDelay = 420;

    for (let pass = 0; pass < riffles; pass++) {
      const baseDelay = pass * passDelay;

      // Fan out phase: cards fly from deck to left and right piles
      for (let i = 0; i < cardsPerPile; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const pileIndex = Math.floor(i / 2);
        const fanDelay = baseDelay + i * 28;
        const rotEnd = side * (8 + pileIndex * 5);
        const xEnd = side * (riffleSpacing / 2 + pileIndex * 12);
        const yEnd = -16 - pileIndex * 4;

        const ghost = document.createElement("div");
        ghost.className = "card-motion-ghost shuffle-ghost";
        ghost.innerHTML = cardBack;
        Object.assign(ghost.style, {
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          "--motion-translate-x": `${xEnd}px`,
          "--motion-translate-y": `${yEnd}px`,
          "--motion-mid-translate-x": `${xEnd * 0.5}px`,
          "--motion-mid-translate-y": `${yEnd - 18}px`,
          "--motion-tilt": `${rotEnd}deg`,
          "--motion-duration": `${160}ms`,
          "--motion-ease": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          "--motion-final-opacity": "0.88",
          opacity: "0",
        });
        layer.appendChild(ghost);

        const startTimer = setTimeout(() => {
          ghost.style.opacity = "0.92";
          ghost.classList.add("running");
        }, fanDelay);

        // Merge back phase: cards return to deck
        const mergeDelay = fanDelay + 175 + i * 22;
        const mergeTimer = setTimeout(() => {
          ghost.style.setProperty("--motion-translate-x", "0px");
          ghost.style.setProperty("--motion-translate-y", "0px");
          ghost.style.setProperty("--motion-mid-translate-x", `${xEnd * 0.5}px`);
          ghost.style.setProperty("--motion-mid-translate-y", `${yEnd * 0.6}px`);
          ghost.style.setProperty("--motion-tilt", "0deg");
          ghost.style.setProperty("--motion-duration", "155ms");
          ghost.style.setProperty("--motion-final-opacity", "0");
          ghost.classList.remove("running");
          void ghost.offsetWidth;
          ghost.classList.add("running");
          setTimeout(() => ghost.remove(), 240);
        }, mergeDelay);

        motionState.timers.push(startTimer, mergeTimer);
      }
    }
  }

  function animateOpeningDeal() {
    if (!state.gameStarted || !state.players.length) {
      return;
    }

    const maxHandSize = Math.max(...state.players.map((player) => player.hand.length), 0);
    let step = 0;

    for (let dealRound = 0; dealRound < maxHandSize; dealRound += 1) {
      for (const player of state.players) {
        const card = player.hand[dealRound];
        if (!card) {
          continue;
        }

        queueCardMotion({
          from: motionAnchor("main-deck"),
          to: player.type === "human" ? motionHandCard(card.id) : motionAnchor(`hand-${player.id}`),
          ghostHtml: renderMotionCard(card, { faceDown: true }),
          duration: 760,
          delay: step * 95,
          variant: "deal",
        });
        step += 1;
      }
    }

    state.prizeCards.forEach((card, index) => {
      queueCardMotion({
        from: motionAnchor("main-deck"),
        to: motionPrizeCard(card.id),
        ghostHtml: renderMotionCard(card),
        duration: 820,
        delay: step * 95 + index * 140,
        variant: "deal",
      });
    });

    flushCardMotions();
  }

  function drawCard() {
    return state.deck.pop() || null;
  }

  function getHandLimit() {
    return state.playerCount < 4 ? 7 : 5;
  }

  function getTotalOwnedCardCount(player) {
    return player.hand.length + player.reserve.length;
  }

  function getOwnedCards(player) {
    return [...player.hand, ...player.reserve.map((entry) => entry.card)];
  }

  function getReadyReserveEntries(player) {
    return player ? player.reserve.filter((entry) => entry.availableRound <= state.roundNumber) : [];
  }

  function canPlayerDrawFromDeck(player) {
    return Boolean(
      player &&
        state.phase === "choose" &&
        !player.lockedIn &&
        player.drawsUsed < 2 &&
        state.deck.length > 0 &&
        player.hand.length < getHandLimit()
    );
  }

  function canPlayerDrawFromReserve(player) {
    return Boolean(
      player &&
        state.phase === "choose" &&
        !player.lockedIn &&
        player.reserveDrawEligibleThisRound &&
        player.hand.length < getHandLimit() &&
        getReadyReserveEntries(player).length
    );
  }

  function canPlayerSwap(player) {
    return Boolean(player && player.hand.length > 0 && state.effectPile.length > 1 && player.swapsUsed < 3);
  }

  function sendCardsToBottom(cards) {
    if (!cards || !cards.length) {
      return;
    }

    state.bottomDeckBuffer.push(...cards);
  }

  function sendCardsToJail(cards) {
    if (!cards || !cards.length) {
      return;
    }

    state.jailDeck.push(...cards);
  }

  function flushBottomDeckBuffer() {
    if (!state.bottomDeckBuffer.length) {
      return;
    }

    state.deck = [...state.bottomDeckBuffer, ...state.deck];
    state.bottomDeckBuffer = [];
  }

  function resetRoundPlays() {
    state.roundPlays = Object.fromEntries(
      state.players.map((player) => [
        player.id,
        {
          actionType: null,
          attackCard: null,
          supportCard: null,
          wild8Mode: null,
          swapCard: null,
          supportTargetPlayerId: null,
          revealed: false,
          legal: null,
          matchType: null,
          effectiveSuit: null,
          effectiveRankValue: null,
          effectiveRankLabel: null,
          effectiveRankMatch: false,
          usedJackBoost: false,
          matchReason: "",
        },
      ])
    );
  }

  function prepareRound() {
    if (state.gameOver) {
      return;
    }

    state.phase = "choose";
    state.winnerPlayerId = null;
    state.pendingPlunderChoice = null;
    state.selectedPlunderCardId = null;
    state.aiTurnsScheduled = false;
    state.focusedHandIndex = 0;
    state.focusedTargetIndex = 0;
    state.focusedPlunderIndex = 0;
    state.draggedHandCardId = null;
    resetRoundPlays();

    for (const player of state.players) {
      player.handCountAtRoundStart = player.hand.length;
      player.ownedCountAtRoundStart = getTotalOwnedCardCount(player);
      player.reserveDrawEligibleThisRound = player.hand.length <= 3;
      player.lockedIn = false;
      player.selectedAttackCardId = null;
      player.selectedSupportCardId = null;
      player.selectedWild8Mode = null;
      player.selectedSwapCardId = null;
      player.selectedSupportTargetPlayerId = null;
      player.committedAttackCard = null;
      player.committedSupportCard = null;
      player.committedSwapCard = null;
    }

    const playersAbleToAct = state.players.filter(
      (player) => player.hand.length > 0 || canPlayerDrawFromDeck(player) || canPlayerDrawFromReserve(player)
    );
    if (!playersAbleToAct.length) {
      if (handleEndOfRoundRefills()) {
        render();
        return;
      }

      if (
        !state.players.some(
          (player) => player.hand.length > 0 || canPlayerDrawFromDeck(player) || canPlayerDrawFromReserve(player)
        ) &&
        !state.players.some((player) => player.reserve.length > 0)
      ) {
        addLog("end", "No player has cards left to contest another round, and the Effects Deck cannot restart play. Final scoring begins.");
        finishGame("No player had cards left and the Effects Deck could not restart play.");
        render();
        return;
      }
    }

    autoPassEmptyHandPlayers();

    const human = getHumanPlayer();
    if (human && human.lockedIn) {
      scheduleAiTurns();
    }

    render();
  }

  function autoPassEmptyHandPlayers() {
    for (const player of state.players) {
      if (player.hand.length > 0 || canPlayerDrawFromDeck(player) || canPlayerDrawFromReserve(player)) {
        continue;
      }

      player.lockedIn = true;
      state.roundPlays[player.id].actionType = "pass";
      state.roundPlays[player.id].revealed = true;
      addLog(
        "round",
        `${player.name} is forced to pass because they have no cards and no legal way to gain one before acting.`
      );
    }
  }

  function clearHumanSelections() {
    const human = getHumanPlayer();
    if (!human || human.lockedIn || state.phase !== "choose") {
      return;
    }

    human.selectedAttackCardId = null;
    human.selectedSupportCardId = null;
    human.selectedWild8Mode = null;
    human.selectedSwapCardId = null;
    human.selectedSupportTargetPlayerId = null;
    render();
  }

  function clearPendingSelections(player) {
    player.selectedAttackCardId = null;
    player.selectedSupportCardId = null;
    player.selectedWild8Mode = null;
    player.selectedSwapCardId = null;
    player.selectedSupportTargetPlayerId = null;
  }

  function getDraggedHandCardId(event) {
    return (
      event.dataTransfer?.getData("text/plain") ||
      state.draggedHandCardId ||
      null
    );
  }

  function canHumanCardFillRole(cardId, role) {
    const human = getHumanPlayer();
    if (!human || human.lockedIn || state.phase !== "choose") {
      return false;
    }

    const card = human.hand.find((candidate) => candidate.id === cardId);
    if (!card) {
      return false;
    }

    if (role === "attack") {
      return true;
    }

    if (role === "support") {
      return card.isSpecial && human.selectedAttackCardId !== cardId;
    }

    if (role === "swap") {
      return canPlayerSwap(human);
    }

    return false;
  }

  function updateSelectionDropTargets(cardId, activeRole) {
    if (!refs.selectionSummary) {
      return;
    }

    const sockets = refs.selectionSummary.querySelectorAll("[data-drop-role]");
    sockets.forEach((socket) => {
      const role = socket.dataset.dropRole;
      const valid = Boolean(cardId) && canHumanCardFillRole(cardId, role);
      socket.classList.toggle("drop-enabled", valid);
      socket.classList.toggle("drag-over", valid && activeRole === role);
    });
  }

  function selectHumanCard(cardId, role) {
    const human = getHumanPlayer();
    if (!human || human.lockedIn || state.phase !== "choose") {
      return;
    }

    const card = human.hand.find((candidate) => candidate.id === cardId);
    if (!card) {
      return;
    }

    if (role === "attack") {
      if (human.selectedAttackCardId === cardId) {
        human.selectedAttackCardId = null;
      } else {
        human.selectedAttackCardId = cardId;
        human.selectedSwapCardId = null;
        if (human.selectedSupportCardId === cardId) {
          human.selectedSupportCardId = null;
          human.selectedSupportTargetPlayerId = null;
          human.selectedWild8Mode = null;
        }
      }
    }

    if (role === "support") {
      if (!card.isSpecial || human.selectedAttackCardId === cardId) {
        return;
      }

      if (human.selectedSupportCardId === cardId) {
        human.selectedSupportCardId = null;
        human.selectedSupportTargetPlayerId = null;
        human.selectedWild8Mode = null;
      } else {
        human.selectedSupportCardId = cardId;
        human.selectedSwapCardId = null;
        if (card.rank !== "2") {
          human.selectedSupportTargetPlayerId = null;
        } else if (!human.selectedSupportTargetPlayerId) {
          human.selectedSupportTargetPlayerId =
            state.players.find((player) => player.id !== human.id)?.id || null;
        }
        if (card.rank !== "8") {
          human.selectedWild8Mode = null;
        }
      }
    }

    if (role === "swap") {
      if (human.selectedSwapCardId === cardId) {
        human.selectedSwapCardId = null;
      } else {
        human.selectedSwapCardId = cardId;
        human.selectedAttackCardId = null;
        human.selectedSupportCardId = null;
        human.selectedWild8Mode = null;
        human.selectedSupportTargetPlayerId = null;
      }
    }

    render();
  }

  function selectHumanWild8Mode(mode) {
    const human = getHumanPlayer();
    if (
      !human ||
      human.lockedIn ||
      state.phase !== "choose" ||
      !WILD_8_MODES.includes(mode) ||
      human.hand.find((card) => card.id === human.selectedSupportCardId)?.rank !== "8"
    ) {
      return;
    }

    human.selectedWild8Mode = mode;
    render();
  }

  function getHumanValidation() {
    const human = getHumanPlayer();
    if (!human) {
      return { ok: false, message: "Missing player.", warning: false };
    }

    if (human.lockedIn) {
      return { ok: true, message: "", warning: false };
    }

    if (human.selectedSwapCardId) {
      const swapBlockers = [];
      if (state.effectPile.length <= 1) {
        swapBlockers.push(`need ${2 - state.effectPile.length} more in Effects`);
      }
      if (human.swapsUsed >= 3) {
        swapBlockers.push("no swaps left");
      }

      if (swapBlockers.length) {
        return {
          ok: false,
          message: `Swap unavailable: ${swapBlockers.join(" • ")}.`,
          warning: false,
        };
      }

      return {
        ok: true,
        message: "",
        warning: false,
      };
    }

    if (!human.selectedAttackCardId) {
      const needsCardsFirst = !human.hand.length && (canPlayerDrawFromReserve(human) || canPlayerDrawFromDeck(human));
      return {
        ok: false,
        message: needsCardsFirst ? "Draw first." : !human.hand.length ? "Forced pass." : "",
        warning: false,
      };
    }

    if (human.selectedSupportCardId && human.selectedSupportCardId === human.selectedAttackCardId) {
      return { ok: false, message: "Attack and support must be different cards.", warning: false };
    }

    const supportCard = human.hand.find((card) => card.id === human.selectedSupportCardId);
    if (supportCard && supportCard.rank === "2" && !human.selectedSupportTargetPlayerId) {
      return { ok: false, message: "Pick a target for 2.", warning: false };
    }

    if (supportCard && supportCard.rank === "8" && !human.selectedWild8Mode) {
      return { ok: false, message: "Pick rank or suit for 8.", warning: false };
    }

    const preview = getHumanSelectedPlayPreview();
    if (preview.attackCard && !preview.analysis.legal) {
      return {
        ok: true,
        message: "Illegal attack. You can still play it.",
        warning: true,
      };
    }

    return { ok: true, message: "", warning: false };
  }

  function executePlayerDeckDraw(player, reason) {
    if (!canPlayerDrawFromDeck(player)) {
      return null;
    }

    const card = drawCard();
    if (!card) {
      return null;
    }

    clearPendingSelections(player);
    queueCardMotion({
      from: motionAnchor("main-deck"),
      to: player.type === "human" ? motionHandCard(card.id) : motionAnchor(`hand-${player.id}`),
      ghostHtml: renderMotionCard(card, { faceDown: player.type !== "human" }),
      duration: 760,
      variant: "draw",
    });
    player.hand.push(card);
    player.drawsUsed += 1;
    addLog(
      "choice",
      `${player.name} draws 1 hidden card from the main deck before choosing a play${reason ? ` (${reason})` : ""}.`
    );
    return card;
  }

  function removeRandomReadyReserveEntry(player) {
    const readyEntries = getReadyReserveEntries(player);
    if (!readyEntries.length) {
      return null;
    }

    const randomEntry = readyEntries[Math.floor(Math.random() * readyEntries.length)];
    const reserveIndex = player.reserve.findIndex(
      (entry) => entry.card.id === randomEntry.card.id && entry.availableRound <= state.roundNumber
    );
    if (reserveIndex === -1) {
      return null;
    }

    const [entry] = player.reserve.splice(reserveIndex, 1);
    return entry.card;
  }

  function removeRandomReserveEntry(player) {
    if (!player?.reserve.length) {
      return null;
    }

    const reserveIndex = Math.floor(Math.random() * player.reserve.length);
    const [entry] = player.reserve.splice(reserveIndex, 1);
    return entry?.card || null;
  }

  function executePlayerReserveDraw(player, reason) {
    if (!canPlayerDrawFromReserve(player)) {
      return null;
    }

    const card = removeRandomReadyReserveEntry(player);
    if (!card) {
      return null;
    }

    clearPendingSelections(player);
    queueCardMotion({
      from: motionAnchor(`reserve-${player.id}`),
      to: player.type === "human" ? motionHandCard(card.id) : motionAnchor(`hand-${player.id}`),
      ghostHtml: renderMotionCard(card, { faceDown: player.type !== "human" }),
      duration: 720,
      variant: "reserve",
    });
    player.hand.push(card);
    addLog(
      "choice",
      `${player.name} draws 1 random hidden card from reserve before choosing a play${reason ? ` (${reason})` : ""}.`
    );
    return card;
  }

  function drawForHumanPlayer() {
    const human = getHumanPlayer();
    if (!human || !canPlayerDrawFromDeck(human)) {
      return;
    }

    executePlayerDeckDraw(human, "");
    render();
  }

  function drawReserveForHumanPlayer() {
    const human = getHumanPlayer();
    if (!human || !canPlayerDrawFromReserve(human)) {
      return;
    }

    executePlayerReserveDraw(human, "");
    render();
  }

  function getHumanSelectedPlayPreview() {
    const human = getHumanPlayer();
    const attackCard = human ? human.hand.find((card) => card.id === human.selectedAttackCardId) : null;
    const supportCard = human ? human.hand.find((card) => card.id === human.selectedSupportCardId) : null;
    const swapCard = human ? human.hand.find((card) => card.id === human.selectedSwapCardId) : null;

    return {
      attackCard,
      supportCard,
      swapCard,
      analysis: analyzeAttack(attackCard, supportCard, state.prizeCards, human?.selectedWild8Mode || null, false),
    };
  }

  function lockInHumanPlay() {
    const human = getHumanPlayer();
    if (!human || human.lockedIn || state.phase !== "choose") {
      return;
    }

    const validation = getHumanValidation();
    if (!validation.ok) {
      render();
      return;
    }

    if (human.selectedSwapCardId) {
      commitPlayerSwap(human, {
        swapCardId: human.selectedSwapCardId,
        reason: "",
      });
    } else {
      commitPlayerAttackPlay(human, {
        attackCardId: human.selectedAttackCardId,
        supportCardId: human.selectedSupportCardId,
        wild8Mode: human.selectedWild8Mode,
        supportTargetPlayerId: human.selectedSupportTargetPlayerId,
        reason: "",
      });
    }

    scheduleAiTurns();
    render();
  }

  function commitPlayerAttackPlay(player, { attackCardId, supportCardId, wild8Mode, supportTargetPlayerId, reason }) {
    const queuedAttackCard = attackCardId ? player.hand.find((card) => card.id === attackCardId) : null;
    const queuedSupportCard = supportCardId ? player.hand.find((card) => card.id === supportCardId) : null;
    const handAnchor = motionAnchor(`hand-${player.id}`);

    if (queuedAttackCard) {
      queueCardMotion({
        from: player.type === "human" ? motionHandCard(queuedAttackCard.id) : handAnchor,
        to: motionAnchor(`round-attack-${player.id}`),
        ghostHtml: renderMotionCard(queuedAttackCard, { faceDown: true }),
        duration: 700,
        variant: "submit",
      });
    }

    if (queuedSupportCard) {
      queueCardMotion({
        from: player.type === "human" ? motionHandCard(queuedSupportCard.id) : handAnchor,
        to: motionAnchor(`round-support-${player.id}`),
        ghostHtml: renderMotionCard(queuedSupportCard),
        duration: 720,
        delay: 90,
        variant: "submit",
      });
    }

    const attackCard = attackCardId ? removeCardFromHand(player, attackCardId) : null;
    const supportCard = supportCardId ? removeCardFromHand(player, supportCardId) : null;

    player.lockedIn = true;
    player.selectedAttackCardId = null;
    player.selectedSupportCardId = null;
    player.selectedWild8Mode = null;
    player.selectedSwapCardId = null;
    player.selectedSupportTargetPlayerId = null;
    player.committedAttackCard = attackCard;
    player.committedSupportCard = supportCard;
    player.committedSwapCard = null;

    state.roundPlays[player.id] = {
      actionType: "attack",
      attackCard,
      supportCard,
      wild8Mode: supportCard?.rank === "8" ? wild8Mode || null : null,
      swapCard: null,
      supportTargetPlayerId: supportTargetPlayerId || null,
      revealed: false,
      legal: null,
      matchType: null,
      effectiveSuit: attackCard ? attackCard.suit : null,
      effectiveRankValue: attackCard ? attackCard.rankValue : null,
      effectiveRankLabel: attackCard ? attackCard.rank : null,
      effectiveRankMatch: false,
      usedJackBoost: false,
      matchReason: "",
    };

    const parts = attackCard ? ["a face-down attack"] : ["no attack"];
    if (supportCard) {
      parts.push(
        `support ${formatCard(supportCard)}${
          supportCard.rank === "2" && supportTargetPlayerId
            ? ` targeting ${getPlayerById(supportTargetPlayerId)?.name || "an opponent"}`
            : supportCard.rank === "8" && wild8Mode
            ? ` as ${wild8Mode}`
            : ""
        }`
      );
    }

    addLog(
      "choice",
      `${player.name} locks in ${parts.join(" and ")}${reason ? ` (${reason})` : ""}.`
    );

    if (supportCard) {
      addLog(
        "support",
        `${player.name} reveals ${formatCard(supportCard)}${
          supportCard.rank === "2" && supportTargetPlayerId
            ? ` targeting ${getPlayerById(supportTargetPlayerId)?.name || "an opponent"}`
            : supportCard.rank === "8" && wild8Mode
            ? ` as ${wild8Mode}`
            : ""
        }.`
      );
    }
  }

  function commitPlayerSwap(player, { swapCardId, reason }) {
    const queuedSwapCard = swapCardId ? player.hand.find((card) => card.id === swapCardId) : null;
    if (queuedSwapCard) {
      queueCardMotion({
        from: player.type === "human" ? motionHandCard(queuedSwapCard.id) : motionAnchor(`hand-${player.id}`),
        to: motionAnchor(`round-attack-${player.id}`),
        ghostHtml: renderMotionCard(queuedSwapCard, { faceDown: true }),
        duration: 700,
        variant: "submit",
      });
    }

    const swapCard = swapCardId ? removeCardFromHand(player, swapCardId) : null;
    if (!swapCard) {
      return;
    }

    player.lockedIn = true;
    player.selectedAttackCardId = null;
    player.selectedSupportCardId = null;
    player.selectedWild8Mode = null;
    player.selectedSwapCardId = null;
    player.selectedSupportTargetPlayerId = null;
    player.committedAttackCard = null;
    player.committedSupportCard = null;
    player.committedSwapCard = swapCard;

    state.roundPlays[player.id] = {
      actionType: "swap",
      attackCard: null,
      supportCard: null,
      wild8Mode: null,
      swapCard,
      supportTargetPlayerId: null,
      revealed: true,
      legal: false,
      matchType: null,
      effectiveSuit: null,
      effectiveRankValue: null,
      effectiveRankLabel: null,
      effectiveRankMatch: false,
      usedJackBoost: false,
      matchReason: "Swapping with the face-down Effects Deck.",
    };

    addLog(
      "choice",
      `${player.name} spends the round swapping with the face-down Effects Deck${reason ? ` (${reason})` : ""}.`
    );
  }

  function removeCardFromHand(player, cardId) {
    const cardIndex = player.hand.findIndex((card) => card.id === cardId);
    if (cardIndex === -1) {
      return null;
    }

    const [card] = player.hand.splice(cardIndex, 1);
    return card;
  }

  function chooseReserveCardsToBank(player, count) {
    return [...player.hand]
      .sort((left, right) => {
        if (right.rankValue !== left.rankValue) {
          return right.rankValue - left.rankValue;
        }

        if (getSuitMetadata(right.suit).order !== getSuitMetadata(left.suit).order) {
          return getSuitMetadata(right.suit).order - getSuitMetadata(left.suit).order;
        }

        return Number(right.isSpecial) - Number(left.isSpecial);
      })
      .slice(0, count);
  }

  function moveCardsToReserve(player, cardIds) {
    const movedCards = [];

    for (const cardId of cardIds) {
      const card = removeCardFromHand(player, cardId);
      if (card) {
        queueCardMotion({
          from: motionAnchor(`hand-${player.id}`),
          to: motionAnchor(`reserve-${player.id}`),
          ghostHtml: renderMotionCard(card),
          duration: 760,
          delay: movedCards.length * 85,
          variant: "reserve",
        });
        movedCards.push(card);
      }
    }

    if (!movedCards.length) {
      return [];
    }

    const availableRound = state.roundNumber + 2;
    player.reserve.push(
      ...movedCards.map((card) => ({
        card,
        availableRound,
      }))
    );

    addLog(
      "cleanup",
      `${player.name} automatically banks ${movedCards.length} highest-ranking card${movedCards.length === 1 ? "" : "s"} into reserve. Those cards cannot be used next round.`
    );
    return movedCards;
  }

  function resolveHandLimitOverflow() {
    const handLimit = getHandLimit();

    for (const player of state.players) {
      const overflow = Math.max(0, player.hand.length - handLimit);
      if (!overflow) {
        continue;
      }

      const reserveCards = chooseReserveCardsToBank(player, overflow);
      moveCardsToReserve(
        player,
        reserveCards.map((card) => card.id)
      );
    }
    return false;
  }

  function scheduleAiTurns() {
    if (state.aiTurnsScheduled || state.gameOver) {
      return;
    }

    state.aiTurnsScheduled = true;
    let delay = 320;

    for (const player of state.players.filter((candidate) => candidate.type === "ai" && !candidate.lockedIn)) {
      scheduleAction(delay, () => commitAiPlay(player.id));
      delay += 260;
    }

    if (state.players.every((player) => player.lockedIn)) {
      onAllPlayersLocked();
    }
  }

  function commitAiPlay(playerId) {
    if (state.phase !== "choose" || state.gameOver || state.pendingPlunderChoice) {
      return;
    }

    const player = getPlayerById(playerId);
    if (!player || player.lockedIn) {
      return;
    }

    const play = chooseAiPlay(player);
    if (play.actionType === "swap") {
      commitPlayerSwap(player, play);
    } else {
      commitPlayerAttackPlay(player, play);
    }

    if (state.players.every((candidate) => candidate.lockedIn)) {
      onAllPlayersLocked();
    }

    render();
  }

  function chooseAiPlay(player) {
    while (shouldAiDrawFromReserveBeforePlaying(player)) {
      executePlayerReserveDraw(player, "AI reloads from reserve");
    }

    while (shouldAiDrawBeforePlaying(player)) {
      executePlayerDeckDraw(player, "AI improves its hand before locking in");
    }

    const candidates = [];
    const sabotageTargets = rankSabotageTargets(player.id);

    for (const attackCard of player.hand) {
      const supportOptions = [null, ...player.hand.filter((card) => card.id !== attackCard.id && card.isSpecial)];

      for (const supportCard of supportOptions) {
        if (supportCard && !supportCard.isSpecial) {
          continue;
        }

        const targetOptions =
          supportCard && supportCard.rank === "2" ? sabotageTargets : [null];
        const wild8Modes =
          supportCard && supportCard.rank === "8" ? ["rank-match", "suit-match"] : [null];

        for (const targetPlayerId of targetOptions) {
          for (const forcedWild8Mode of wild8Modes) {
            const candidate = scoreAiCandidate(
              player,
              attackCard,
              supportCard,
              targetPlayerId,
              forcedWild8Mode
            );
            candidates.push(candidate);
          }
        }
      }
    }

    if (canPlayerSwap(player)) {
      for (const swapCard of player.hand) {
        candidates.push(scoreAiSwapCandidate(player, swapCard));
      }
    }

    candidates.sort((left, right) => compareAiCandidates(left, right, player.id));
    const choice = candidates[0];

    if (choice.actionType === "swap") {
      return {
        actionType: "swap",
        swapCardId: choice.swapCard.id,
        reason: choice.reason,
      };
    }

    return {
      actionType: "attack",
      attackCardId: choice.attackCard.id,
      supportCardId: choice.supportCard ? choice.supportCard.id : null,
      wild8Mode: choice.wild8Mode || null,
      supportTargetPlayerId: choice.targetPlayerId,
      reason: choice.reason,
    };
  }

  function shouldAiDrawFromReserveBeforePlaying(player) {
    return canPlayerDrawFromReserve(player);
  }

  function shouldAiDrawBeforePlaying(player) {
    if (!canPlayerDrawFromDeck(player)) {
      return false;
    }

    if (!player.hand.length) {
      return true;
    }

    const hasLegalAttack = player.hand.some((attackCard) => analyzeAttack(attackCard, null, state.prizeCards).legal);
    if (!hasLegalAttack) {
      return true;
    }

    const highestRank = player.hand.reduce((best, card) => Math.max(best, card.rankValue), 0);
    return highestRank <= 6 && player.drawsUsed === 0;
  }

  function scoreAiCandidate(player, attackCard, supportCard, targetPlayerId, forcedWild8Mode = null) {
    const wild8Mode = supportCard?.rank === "8" ? forcedWild8Mode || "suit-match" : null;
    const analysis = analyzeAttack(attackCard, supportCard, state.prizeCards, wild8Mode);
    const baseline = analyzeAttack(attackCard, null, state.prizeCards);
    const boostedBy = Math.max(0, (analysis.effectiveRankValue || attackCard.rankValue) - attackCard.rankValue);
    let score = (analysis.effectiveRankValue || attackCard.rankValue) * 8;

    if (analysis.legal) {
      score += 90;
    } else {
      score -= 90;
    }

    if (analysis.matchType === "suit-match") {
      score += 14;
    }

    if (analysis.matchType === "rank-match") {
      score += 8;
    }

    if (!supportCard) {
      score += 8;
    } else {
      score -= 4;
    }

    let reason = "saves power cards while keeping pressure on the prize.";

    if (supportCard) {
      switch (supportCard.rank) {
        case "8":
          score += baseline.legal ? 8 : 30;
          if (baseline.matchType === "suit-match") {
            score -= 18;
          }
          reason = baseline.legal
            ? "uses 8 to force the stronger suit-match tie layer."
            : "uses 8 to rescue an otherwise illegal attack.";
          break;
        case "A":
          if (!baseline.legal && analysis.legal) {
            score += 26;
          } else if (analysis.effectiveSuit !== attackCard.suit) {
            score += 10;
          } else {
            score -= 12;
          }
          reason = !baseline.legal && analysis.legal
            ? `uses ${formatCard(supportCard)} to shift suits and become legal.`
            : `uses ${formatCard(supportCard)} to improve suit pressure.`;
          break;
        case "J":
          if (boostedBy > 0) {
            score += boostedBy * 10;
          } else {
            score -= 18;
          }
          if (!baseline.legal && analysis.legal) {
            score += 28;
          } else if (analysis.legal) {
            score += 10;
          } else {
            score -= 16;
          }
          reason = boostedBy > 0
            ? `uses ${formatCard(supportCard)} to boost ${attackCard.rank} into ${analysis.effectiveRankLabel}.`
            : `holds ${formatCard(supportCard)} because ${attackCard.rank} is already at the Ace ceiling.`;
          break;
        case "Q":
          score += Math.max(0, state.playerCount - 2) * 4;
          if (analysis.legal) {
            score += analysis.matchType === "rank-match" ? 18 : 10;
          } else {
            score -= 20;
          }
          reason = "uses Queen Lockdown only if the attack looks good enough to jail the losing attacks.";
          break;
        case "K": {
          const totalReserveCount = state.players.reduce((total, candidate) => total + candidate.reserve.length, 0);
          const opposingReserveCount = Math.max(0, totalReserveCount - player.reserve.length);
          score += opposingReserveCount * 8;
          score -= player.reserve.length * 4;
          if (!totalReserveCount) {
            score -= 18;
          }
          if (analysis.legal) {
            score += analysis.matchType === "rank-match" ? 16 : 8;
          } else {
            score -= 20;
          }
          reason = totalReserveCount
            ? "uses King only if the attack looks good enough to jail reserve cards across the table."
            : "avoids wasting King when nobody has reserve cards to jail.";
          break;
        }
        case "7":
          score += analysis.legal ? 18 : -14;
          score += estimatePlunderValue();
          reason = "uses 7 because the attack looks strong enough to plunder.";
          break;
        case "2":
          score += 4;
          if (targetPlayerId === getHandLeaderId(player.id)) {
            score += 12;
          }
          if (analysis.legal) {
            score += analysis.matchType === "rank-match" ? 18 : 10;
          } else {
            score -= 20;
          }
          reason = `uses 2 only if the attack looks good enough to sabotage ${getPlayerById(targetPlayerId)?.name || "an opponent"}.`;
          break;
        default:
          break;
      }
    } else if (baseline.matchType === "rank-match") {
      reason = "keeps a rank-match without spending a power card.";
    } else if (baseline.matchType === "suit-match") {
      reason = "takes a clean suit-match and keeps powers for later.";
    } else {
      reason = "has no clean legal line and throws the least bad attack.";
    }

    return {
      actionType: "attack",
      playerId: player.id,
      attackCard,
      supportCard,
      wild8Mode,
      targetPlayerId,
      analysis,
      baseline,
      score,
      reason,
    };
  }

  function scoreAiSwapCandidate(player, swapCard) {
    const bestNaturalScore = player.hand.reduce((best, card) => {
      if (card.id === swapCard.id) {
        return best;
      }

      const natural = analyzeAttack(card, null, state.prizeCards);
      let score = natural.legal ? card.rankValue * 8 : -40 + card.rankValue;
      if (natural.matchType === "suit-match") {
        score += 12;
      }
      if (natural.matchType === "rank-match") {
        score += 6;
      }

      return Math.max(best, score);
    }, -999);

    let score = 18 - swapCard.rankValue;
    if (bestNaturalScore < 40) {
      score += 44;
    } else if (bestNaturalScore < 90) {
      score += 16;
    } else {
      score -= 22;
    }

    if (swapCard.isSpecial) {
      score -= 8;
    }

    if (player.hand.length <= 2) {
      score += 8;
    }

    score -= player.swapsUsed * 12;

    return {
      actionType: "swap",
      playerId: player.id,
      swapCard,
      analysis: { legal: false },
      score,
      reason: "dumps a weak card into the face-down Effects Deck instead of forcing a bad contest.",
    };
  }

  function compareAiCandidates(left, right, aiPlayerId) {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if ((right.actionType || "attack") !== (left.actionType || "attack")) {
      return (left.actionType || "attack") === "attack" ? -1 : 1;
    }

    if ((left.actionType || "attack") === "swap") {
      if (left.swapCard.rankValue !== right.swapCard.rankValue) {
        return left.swapCard.rankValue - right.swapCard.rankValue;
      }

      return getPlayerOrderIndex(left.playerId || aiPlayerId) - getPlayerOrderIndex(right.playerId || aiPlayerId);
    }

    if (Number(right.analysis.legal) !== Number(left.analysis.legal)) {
      return Number(right.analysis.legal) - Number(left.analysis.legal);
    }

    if (Number(Boolean(left.supportCard)) !== Number(Boolean(right.supportCard))) {
      return Number(Boolean(left.supportCard)) - Number(Boolean(right.supportCard));
    }

    if (getAnalysisRankValue(right.analysis) !== getAnalysisRankValue(left.analysis)) {
      return getAnalysisRankValue(right.analysis) - getAnalysisRankValue(left.analysis);
    }

    return (
      getPlayerOrderIndex(left.playerId || aiPlayerId) - getPlayerOrderIndex(right.playerId || aiPlayerId)
    );
  }

  function estimatePlunderValue() {
    return 6 + Math.max(0, state.playerCount - 2) * 3;
  }

  function rankSabotageTargets(aiPlayerId) {
    return state.players
      .filter((player) => player.id !== aiPlayerId)
      .sort((left, right) => {
        if (right.hand.length !== left.hand.length) {
          return right.hand.length - left.hand.length;
        }

        const leftThreat = estimateThreat(left);
        const rightThreat = estimateThreat(right);
        if (leftThreat !== rightThreat) {
          return leftThreat - rightThreat;
        }

        return getPlayerOrderIndex(left.id) - getPlayerOrderIndex(right.id);
      })
      .map((player) => player.id);
  }

  function estimateThreat(player) {
    if (!player.hand.length) {
      return -999;
    }

    return player.hand.reduce((best, attackCard) => {
      const plain = analyzeAttack(attackCard, null, state.prizeCards);
      const withWild = player.hand
        .filter((card) => card.id !== attackCard.id && card.rank === "8")
        .some(() => true);

      let score = plain.legal ? 2 : 0;
      if (plain.matchType === "rank-match") {
        score += 2;
      }
      if (withWild) {
        score += 1;
      }

      return Math.max(best, score);
    }, -1000);
  }

  function getHandLeaderId(excludePlayerId) {
    const contenders = state.players.filter((player) => player.id !== excludePlayerId);
    if (!contenders.length) {
      return null;
    }

    contenders.sort((left, right) => {
      if (right.hand.length !== left.hand.length) {
        return right.hand.length - left.hand.length;
      }

      return getPlayerOrderIndex(left.id) - getPlayerOrderIndex(right.id);
    });

    return contenders[0].id;
  }

  function onAllPlayersLocked() {
    if (state.gameOver || state.pendingPlunderChoice) {
      return;
    }

    state.phase = "revealSupports";
    addLog("round", "All players are locked in. Support cards stay visible before the attacks flip.");
    render();

    scheduleAction(450, () => {
      state.phase = "revealAttacks";
      state.revealPulsePlayerIds = state.players
        .map((player) => player.id)
        .filter((playerId) => Boolean(state.roundPlays[playerId]?.attackCard));

      for (const play of Object.values(state.roundPlays)) {
        if (play.attackCard) {
          play.revealed = true;
        }
      }

      addLog(
        "reveal",
        `Attacks revealed: ${state.players
          .map((player) => {
            const play = state.roundPlays[player.id];
            if (play.actionType === "swap") {
              return `${player.name} swaps instead of attacking`;
            }

            return play.attackCard ? `${player.name} ${formatCard(play.attackCard)}` : `${player.name} is forced to pass`;
          })
          .join("; ")}.`
      );
      render();
      scheduleAction(220, () => {
        state.revealPulsePlayerIds = [];
        render();
      });

      scheduleAction(520, resolveRound);
    });
  }

  function resolveRound() {
    if (state.gameOver) {
      return;
    }

    state.phase = "resolve";
    const analyses = state.players.map((player) => buildPlayAnalysis(player));

    for (const analysis of analyses) {
      const play = state.roundPlays[analysis.playerId];
      play.legal = analysis.legal;
      play.matchType = analysis.matchType;
      play.effectiveSuit = analysis.effectiveSuit;
      play.effectiveRankValue = analysis.effectiveRankValue;
      play.effectiveRankLabel = analysis.effectiveRankLabel;
      play.effectiveRankMatch = analysis.matchType === "rank-match";
      play.usedJackBoost = analysis.usedJackBoost;
      play.matchReason = analysis.reason;
    }

    addLog(
      "resolve",
      analyses
        .map((analysis) => {
          if (analysis.actionType === "swap") {
            return `${analysis.name}: swap`;
          }

          if (!analysis.attackCard) {
            return `${analysis.name}: no attack`;
          }

          return `${analysis.name}: ${analysis.legal ? analysis.matchType : "illegal"}${analysis.reason ? ` (${analysis.reason})` : ""}`;
        })
        .join(" | ")
    );

    const legalContenders = analyses.filter((analysis) => analysis.legal);
    if (!legalContenders.length) {
      handleNoValidAttack(analyses);
      return;
    }

    const contenderPool = [...legalContenders].sort((left, right) =>
      compareContenders(left, right)
    );

    const winnerAnalysis = contenderPool[0];
    state.winnerPlayerId = winnerAnalysis.playerId;
    state.winnerPulsePlayerId = winnerAnalysis.playerId;

    addLog(
      "resolve",
      buildWinnerExplanation(winnerAnalysis, contenderPool)
    );

    const winnerSupport = state.roundPlays[winnerAnalysis.playerId].supportCard;
    const eligiblePlunderTargets = analyses.filter(
      (analysis) => analysis.playerId !== winnerAnalysis.playerId && analysis.attackCard
    );

      if (winnerSupport && winnerSupport.rank === "7" && eligiblePlunderTargets.length) {
      if (getPlayerById(winnerAnalysis.playerId)?.type === "human") {
        state.pendingPlunderChoice = {
          analyses,
          winnerAnalysis,
          options: eligiblePlunderTargets.map((analysis) => ({
            playerId: analysis.playerId,
            playerName: analysis.name,
            card: analysis.attackCard,
          })),
        };
        state.selectedPlunderCardId = eligiblePlunderTargets[0].attackCard.id;
        state.focusedPlunderIndex = 0;
        addLog("support", `${winnerAnalysis.name} may plunder one losing attack card.`);
        render();
        return;
      }

      const aiCapture = chooseAiPlunderTarget(eligiblePlunderTargets);
      addLog(
        "support",
        `${winnerAnalysis.name} uses Plunder to capture ${formatCard(aiCapture.attackCard)} from ${aiCapture.name}.`
      );
      finalizeResolvedRound(analyses, winnerAnalysis, aiCapture.attackCard.id);
      return;
    }

    finalizeResolvedRound(analyses, winnerAnalysis, null);
  }

  function buildPlayAnalysis(player) {
    const play = state.roundPlays[player.id];
    const analysis = analyzeAttack(play.attackCard, play.supportCard, state.prizeCards, play.wild8Mode);

    return {
      playerId: player.id,
      name: player.name,
      actionType: play.actionType,
      attackCard: play.attackCard,
      supportCard: play.supportCard,
      wild8Mode: play.wild8Mode,
      swapCard: play.swapCard,
      supportTargetPlayerId: play.supportTargetPlayerId,
      ...analysis,
    };
  }

  function analyzeAttack(attackCard, supportCard, prizeCards, wild8Mode = null, allowWild8Auto = true) {
    if (!attackCard) {
      return {
        legal: false,
        matchType: null,
        effectiveSuit: null,
        effectiveColor: null,
        effectiveRankValue: null,
        effectiveRankLabel: null,
        matchedPrizeCardIds: [],
        reason: "",
        usedWild8: false,
        usedAceShift: false,
        usedJackBoost: false,
      };
    }

    let effectiveSuit = supportCard && supportCard.rank === "A" ? supportCard.suit : attackCard.suit;
    let effectiveColor = getSuitMetadata(effectiveSuit).color;
    let effectiveRankValue = getEffectiveAttackRankValue(attackCard, supportCard);
    let effectiveRankLabel = getRankLabelForValue(effectiveRankValue);
    const usedAceShift = Boolean(
      supportCard && supportCard.rank === "A" && supportCard.suit !== attackCard.suit
    );
    const usedJackBoost = Boolean(
      supportCard && supportCard.rank === "J" && effectiveRankValue !== attackCard.rankValue
    );
    const jackPrefix =
      supportCard && supportCard.rank === "J"
        ? usedJackBoost
          ? `Jack boosts ${attackCard.rank} to ${effectiveRankLabel}. `
          : `Jack cannot raise ${attackCard.rank} above Ace. `
        : "";
    let wild8Prefix = "";

    if (supportCard && supportCard.rank === "8") {
      const resolvedWild8Mode = wild8Mode || (allowWild8Auto ? "suit-match" : null);
      if (!resolvedWild8Mode) {
        return {
          legal: false,
          matchType: null,
          effectiveSuit,
          effectiveColor,
          effectiveRankValue,
          effectiveRankLabel,
          matchedPrizeCardIds: [],
          reason: "Choose whether the 8 counts as rank-match or suit-match.",
          usedWild8: true,
          usedAceShift: false,
          usedJackBoost: false,
        };
      }

      if (resolvedWild8Mode === "rank-match") {
        const bestPrizeRankCard = getBestPrizeRankCard(prizeCards);
        if (bestPrizeRankCard) {
          effectiveRankValue = bestPrizeRankCard.rankValue;
          effectiveRankLabel = bestPrizeRankCard.rank;
          wild8Prefix = `8 shifts the attack to rank ${effectiveRankLabel}. `;
        }
      } else {
        const bestPrizeSuit = getBestPrizeSuit(prizeCards);
        effectiveSuit = bestPrizeSuit.key;
        effectiveColor = bestPrizeSuit.color;
        wild8Prefix = `8 shifts the attack into ${bestPrizeSuit.label}. `;
      }
    }

    const effectPrefix = `${jackPrefix}${wild8Prefix}`;
    const rankMatches = prizeCards.filter((card) => card.rankValue === effectiveRankValue);
    const suitMatches = prizeCards.filter((card) => card.suit === effectiveSuit);
    const matchedPrizeCardIds = [
      ...new Set([...rankMatches, ...suitMatches].map((card) => card.id)),
    ];

    if (rankMatches.length && suitMatches.length) {
      return {
        legal: true,
        matchType: "suit-match",
        effectiveSuit,
        effectiveColor,
        effectiveRankValue,
        effectiveRankLabel,
        matchedPrizeCardIds,
        reason: `${effectPrefix}Matches prize rank ${effectiveRankLabel} and prize suit ${getSuitMetadata(effectiveSuit).label}.`,
        usedWild8: Boolean(supportCard && supportCard.rank === "8"),
        usedAceShift,
        usedJackBoost,
      };
    }

    if (rankMatches.length) {
      return {
        legal: true,
        matchType: "rank-match",
        effectiveSuit,
        effectiveColor,
        effectiveRankValue,
        effectiveRankLabel,
        matchedPrizeCardIds: rankMatches.map((card) => card.id),
        reason: `${effectPrefix}Matches prize rank ${effectiveRankLabel}.`,
        usedWild8: Boolean(supportCard && supportCard.rank === "8"),
        usedAceShift,
        usedJackBoost,
      };
    }

    if (suitMatches.length) {
      return {
        legal: true,
        matchType: "suit-match",
        effectiveSuit,
        effectiveColor,
        effectiveRankValue,
        effectiveRankLabel,
        matchedPrizeCardIds: suitMatches.map((card) => card.id),
        reason: `${effectPrefix}Matches prize suit ${getSuitMetadata(effectiveSuit).label}.`,
        usedWild8: Boolean(supportCard && supportCard.rank === "8"),
        usedAceShift,
        usedJackBoost,
      };
    }

    return {
      legal: false,
      matchType: null,
      effectiveSuit,
      effectiveColor,
      effectiveRankValue,
      effectiveRankLabel,
      matchedPrizeCardIds: [],
      reason: supportCard && supportCard.rank === "A"
        ? `Ace shifts the suit, but it still misses both prize cards.`
        : supportCard && supportCard.rank === "J"
        ? `${jackPrefix}Still misses both prize cards.`
        : supportCard && supportCard.rank === "8"
        ? `${effectPrefix}It still misses both prize cards.`
        : "Does not match either prize card by rank or suit.",
      usedWild8: Boolean(supportCard && supportCard.rank === "8"),
      usedAceShift,
      usedJackBoost,
    };
  }

  function compareContenders(left, right) {
    if (getAnalysisRankValue(right) !== getAnalysisRankValue(left)) {
      return getAnalysisRankValue(right) - getAnalysisRankValue(left);
    }

    if (getMatchTypePriority(right.matchType) !== getMatchTypePriority(left.matchType)) {
      return getMatchTypePriority(right.matchType) - getMatchTypePriority(left.matchType);
    }

    const leftSuit = getSuitMetadata(left.effectiveSuit || left.attackCard.suit);
    const rightSuit = getSuitMetadata(right.effectiveSuit || right.attackCard.suit);
    if (leftSuit.order !== rightSuit.order) {
      return rightSuit.order - leftSuit.order;
    }

    if (Number(right.usedAceShift) !== Number(left.usedAceShift)) {
      return Number(right.usedAceShift) - Number(left.usedAceShift);
    }

    if (Number(left.usedWild8) !== Number(right.usedWild8)) {
      return Number(left.usedWild8) - Number(right.usedWild8);
    }

    if (left.usedWild8 && right.usedWild8) {
      const leftSupportSuit = getSuitMetadata(left.supportCard?.suit || left.effectiveSuit);
      const rightSupportSuit = getSuitMetadata(right.supportCard?.suit || right.effectiveSuit);
      if (leftSupportSuit.order !== rightSupportSuit.order) {
        return rightSupportSuit.order - leftSupportSuit.order;
      }
    }

    return getPlayerOrderIndex(left.playerId) - getPlayerOrderIndex(right.playerId);
  }

  function buildWinnerExplanation(winnerAnalysis, contenderPool) {
    if (contenderPool.length === 1) {
      return `${winnerAnalysis.name} is the only legal contender and wins the round.`;
    }

    const runnerUp = contenderPool[1];
    if (!runnerUp) {
      return `${winnerAnalysis.name} wins the round.`;
    }

    if (getAnalysisRankValue(winnerAnalysis) !== getAnalysisRankValue(runnerUp)) {
      return `${winnerAnalysis.name} wins with the higher legal attack rank: ${formatRankBattleCard(winnerAnalysis)} over ${formatRankBattleCard(runnerUp)}.`;
    }

    if (getMatchTypePriority(winnerAnalysis.matchType) !== getMatchTypePriority(runnerUp.matchType)) {
      return `${winnerAnalysis.name} wins the tied-rank comparison because suit-match beats rank-match.`;
    }

    const winnerSuit = getSuitMetadata(winnerAnalysis.effectiveSuit || winnerAnalysis.attackCard.suit);
    const runnerSuit = getSuitMetadata(runnerUp.effectiveSuit || runnerUp.attackCard.suit);
    if (winnerSuit.order !== runnerSuit.order) {
      return `${winnerAnalysis.name} wins the suit hierarchy tie-break: ${winnerSuit.label} over ${runnerSuit.label}.`;
    }

    if (winnerAnalysis.usedAceShift !== runnerUp.usedAceShift) {
      return `${winnerAnalysis.name} wins the exact tie because Ace Suit Shift beats a non-Ace dead tie.`;
    }

    if (winnerAnalysis.usedWild8 !== runnerUp.usedWild8) {
      return `${winnerAnalysis.name} wins the exact tie because wild 8 is weaker than a natural or Ace-made tie.`;
    }

    if (winnerAnalysis.usedWild8 && runnerUp.usedWild8) {
      const winnerSupportSuit = getSuitMetadata(winnerAnalysis.supportCard?.suit || winnerAnalysis.effectiveSuit);
      const runnerSupportSuit = getSuitMetadata(runnerUp.supportCard?.suit || runnerUp.effectiveSuit);
      return `${winnerAnalysis.name} wins the 8-v-8 dead tie: ${winnerSupportSuit.label} support beats ${runnerSupportSuit.label}.`;
    }

    return `${winnerAnalysis.name} wins the final deterministic seat-order tie-break.`;
  }

  function getBestPrizeSuit(prizeCards) {
    return [...prizeCards]
      .map((card) => getSuitMetadata(card.suit))
      .sort((left, right) => right.order - left.order)[0] || SUITS[0];
  }

  function getBestPrizeRankCard(prizeCards) {
    return [...prizeCards].sort((left, right) => {
      if (right.rankValue !== left.rankValue) {
        return right.rankValue - left.rankValue;
      }

      return getSuitMetadata(right.suit).order - getSuitMetadata(left.suit).order;
    })[0] || null;
  }

  function getMatchTypePriority(matchType) {
    return matchType === "suit-match" ? 2 : matchType === "rank-match" ? 1 : 0;
  }

  function chooseAiPlunderTarget(losingAnalyses) {
    return [...losingAnalyses].sort((left, right) => {
      if (Number(right.attackCard.isSpecial) !== Number(left.attackCard.isSpecial)) {
        return Number(right.attackCard.isSpecial) - Number(left.attackCard.isSpecial);
      }

      if (right.attackCard.rankValue !== left.attackCard.rankValue) {
        return right.attackCard.rankValue - left.attackCard.rankValue;
      }

      return getPlayerOrderIndex(left.playerId) - getPlayerOrderIndex(right.playerId);
    })[0];
  }

  function confirmHumanPlunder() {
    if (!state.pendingPlunderChoice || !state.selectedPlunderCardId) {
      return;
    }

    const target = state.pendingPlunderChoice.options.find(
      (option) => option.card.id === state.selectedPlunderCardId
    );
    if (target) {
      addLog("support", `${state.pendingPlunderChoice.winnerAnalysis.name} uses Plunder to capture ${formatCard(target.card)} from ${target.playerName}.`);
    }

    const { analyses, winnerAnalysis } = state.pendingPlunderChoice;
    const plunderCardId = state.selectedPlunderCardId;

    state.pendingPlunderChoice = null;
    state.selectedPlunderCardId = null;

    finalizeResolvedRound(analyses, winnerAnalysis, plunderCardId);
  }

  function finalizeResolvedRound(analyses, winnerAnalysis, plunderCardId) {
    const winner = getPlayerById(winnerAnalysis.playerId);
    if (!winner) {
      return;
    }

    const winnerSupport = state.roundPlays[winnerAnalysis.playerId]?.supportCard || null;
    const queenActive = Boolean(winnerSupport && winnerSupport.rank === "Q");
    const kingActive = Boolean(winnerSupport && winnerSupport.rank === "K");
    const sabotageTargetPlayerId =
      winnerSupport && winnerSupport.rank === "2"
        ? state.roundPlays[winnerAnalysis.playerId]?.supportTargetPlayerId || null
        : null;
    const losingAttackOwners = new Set(
      analyses
        .filter((analysis) => analysis.playerId !== winnerAnalysis.playerId && analysis.attackCard)
        .map((analysis) => analysis.playerId)
    );
    const sabotagedLosers = new Set(
      sabotageTargetPlayerId && losingAttackOwners.has(sabotageTargetPlayerId)
        ? [sabotageTargetPlayerId]
        : []
    );

    if (queenActive) {
      addLog(
        "support",
        `${winner.name} wins with Queen Lockdown. Losing attack cards are banished to the Jail Deck this round.`
      );
    }

    if (sabotagedLosers.size) {
      addLog(
        "support",
        `${winner.name}'s Targeted Sabotage hits: ${[...sabotagedLosers]
          .map((playerId) => getPlayerById(playerId)?.name || "Unknown")
          .join(", ")}.`
      );
    }

    if (state.prizeCards.length) {
      state.prizeCards.forEach((card, index) => {
        queueCardMotion({
          from: motionPrizeCard(card.id),
          to: motionAnchor(`hand-${winner.id}`),
          ghostHtml: renderMotionCard(card),
          duration: 860,
          delay: index * 120,
          variant: "capture",
        });
      });
      winner.hand.push(...state.prizeCards);
      addLog(
        "award",
        `${winner.name} captures ${state.prizeCards.map((card) => formatCard(card)).join(" and ")}.`
      );
    }

    const capturedAttackIds = new Set();
    if (plunderCardId) {
      const plundered = analyses.find((analysis) => analysis.attackCard && analysis.attackCard.id === plunderCardId);
      if (plundered) {
        queueCardMotion({
          from: motionAnchor(`round-attack-${plundered.playerId}`),
          to: motionAnchor(`hand-${winner.id}`),
          ghostHtml: renderMotionCard(plundered.attackCard),
          duration: 920,
          delay: 170,
          variant: "capture",
        });
        winner.hand.push(plundered.attackCard);
        capturedAttackIds.add(plundered.attackCard.id);
      }
    }

    resolveCommittedSwaps();

    for (const analysis of analyses) {
      if (analysis.playerId === winnerAnalysis.playerId || !analysis.attackCard) {
        continue;
      }

      if (capturedAttackIds.has(analysis.attackCard.id)) {
        continue;
      }

      const losingPlayer = getPlayerById(analysis.playerId);
      const cardBlocked = queenActive || sabotagedLosers.has(analysis.playerId);

      if (cardBlocked) {
        queueCardMotion({
          from: motionAnchor(`round-attack-${analysis.playerId}`),
          to: motionAnchor("jail-deck"),
          ghostHtml: renderMotionCard(analysis.attackCard),
          duration: 760,
          delay: getPlayerOrderIndex(analysis.playerId) * 95,
          variant: "banish",
        });
        sendCardsToJail([analysis.attackCard]);
        addLog(
          "cleanup",
          `${losingPlayer.name}'s ${formatCard(analysis.attackCard)} is banished to the Jail Deck.`
        );
      } else {
        queueCardMotion({
          from: motionAnchor(`round-attack-${analysis.playerId}`),
          to: motionAnchor(`hand-${analysis.playerId}`),
          ghostHtml: renderMotionCard(analysis.attackCard),
          duration: 760,
          delay: getPlayerOrderIndex(analysis.playerId) * 80,
          variant: "draw",
        });
        losingPlayer.hand.push(analysis.attackCard);
        addLog(
          "cleanup",
          `${losingPlayer.name} reclaims ${formatCard(analysis.attackCard)}.`
        );
      }
    }

    if (kingActive) {
      const jailedReserveOwners = [];
      for (const player of state.players) {
        const reserveCard = removeRandomReserveEntry(player);
        if (!reserveCard) {
          continue;
        }

        queueCardMotion({
          from: motionAnchor(`reserve-${player.id}`),
          to: motionAnchor("jail-deck"),
          ghostHtml: renderMotionCard(reserveCard, { faceDown: true }),
          duration: 780,
          delay: getPlayerOrderIndex(player.id) * 95,
          variant: "banish",
        });
        sendCardsToJail([reserveCard]);
        jailedReserveOwners.push(player.name);
      }

      addLog(
        "support",
        jailedReserveOwners.length
          ? `${winner.name} wins with King's Decree. ${jailedReserveOwners.join(", ")} banish ${jailedReserveOwners.length === 1 ? "1 reserve card" : "1 reserve card each"} to the Jail Deck.`
          : `${winner.name} wins with King's Decree, but no reserve cards are available to banish.`
      );
    }

    const usedSupports = analyses.filter((analysis) => analysis.supportCard).map((analysis) => analysis.supportCard);
    if (usedSupports.length) {
      analyses
        .filter((analysis) => analysis.supportCard)
        .forEach((analysis, index) => {
          queueCardMotion({
            from: motionAnchor(`round-support-${analysis.playerId}`),
            to: motionAnchor("effects-deck"),
            ghostHtml: renderMotionCard(analysis.supportCard),
            duration: 720,
            delay: index * 90,
            variant: "discard",
          });
        });
      state.effectPile.push(...usedSupports);
      addLog(
        "cleanup",
        `${usedSupports.length} support card${usedSupports.length === 1 ? " moves" : "s move"} face down to the Effects Deck.`
      );
    }

    const continueResolvedRound = () => {
      if (handleEndOfRoundRefills()) {
        render();
        return;
      }

      flushBottomDeckBuffer();

      state.players.forEach((player) => {
        player.wonLastRound = player.id === winnerAnalysis.playerId;
      });

      const winningAttackCard = state.roundPlays[winnerAnalysis.playerId].attackCard;
      const replacementPrize = drawCard();
      if (!winningAttackCard || !replacementPrize) {
        state.prizeCards = winningAttackCard ? [winningAttackCard] : [];
        addLog("end", "The deck cannot provide the next prize card. Final scoring begins.");
        finishGame();
        render();
        return;
      }

      state.prizeCards = [winningAttackCard, replacementPrize];
      queueCardMotion({
        from: motionAnchor(`round-attack-${winnerAnalysis.playerId}`),
        to: motionPrizeCard(winningAttackCard.id),
        ghostHtml: renderMotionCard(winningAttackCard),
        duration: 780,
        variant: "capture",
      });
      queueCardMotion({
        from: motionAnchor("main-deck"),
        to: motionPrizeCard(replacementPrize.id),
        ghostHtml: renderMotionCard(replacementPrize),
        duration: 820,
        delay: 170,
        variant: "draw",
      });
      addLog(
        "award",
        `${formatCard(winningAttackCard)} stays in the center. ${formatCard(replacementPrize)} flips in as the new prize.`
      );

      state.phase = "cleanup";
      render();

      scheduleAction(900, beginNextRound);
    };

    resolveHandLimitOverflow();
    continueResolvedRound();
  }

  function handleNoValidAttack(analyses) {
    state.winnerPulsePlayerId = null;
    addLog("resolve", "No legal contenders. The prize pair rolls away and everyone keeps their attack card.");

    for (const analysis of analyses) {
      if (!analysis.attackCard) {
        continue;
      }

      const owner = getPlayerById(analysis.playerId);
      queueCardMotion({
        from: motionAnchor(`round-attack-${analysis.playerId}`),
        to: motionAnchor(`hand-${analysis.playerId}`),
        ghostHtml: renderMotionCard(analysis.attackCard),
        duration: 760,
        delay: getPlayerOrderIndex(analysis.playerId) * 80,
        variant: "draw",
      });
      owner.hand.push(analysis.attackCard);
      addLog("cleanup", `${owner.name} reclaims ${formatCard(analysis.attackCard)} after the dead round.`);
    }

    resolveCommittedSwaps();

    const usedSupports = analyses.filter((analysis) => analysis.supportCard).map((analysis) => analysis.supportCard);
    if (usedSupports.length) {
      analyses
        .filter((analysis) => analysis.supportCard)
        .forEach((analysis, index) => {
          queueCardMotion({
            from: motionAnchor(`round-support-${analysis.playerId}`),
            to: motionAnchor("effects-deck"),
            ghostHtml: renderMotionCard(analysis.supportCard),
            duration: 720,
            delay: index * 90,
            variant: "discard",
          });
        });
      state.effectPile.push(...usedSupports);
      addLog(
        "cleanup",
        `${usedSupports.length} support card${usedSupports.length === 1 ? " moves" : "s move"} face down to the Effects Deck.`
      );
    }

    if (handleEndOfRoundRefills()) {
      render();
      return;
    }

    if (state.prizeCards.length) {
      state.prizeCards.forEach((card, index) => {
        queueCardMotion({
          from: motionPrizeCard(card.id),
          to: motionAnchor("main-deck"),
          ghostHtml: renderMotionCard(card),
          duration: 760,
          delay: index * 110,
          variant: "discard",
        });
      });
      addLog(
        "cleanup",
        `Prize cards ${state.prizeCards.map((card) => formatCard(card)).join(" and ")} move to the bottom of the deck.`
      );
      sendCardsToBottom(state.prizeCards);
      state.prizeCards = [];
    }

    flushBottomDeckBuffer();
    state.players.forEach((player) => {
      player.wonLastRound = false;
    });

    if (state.deck.length < 2) {
      addLog("end", "The deck cannot reveal two new prize cards after the dead round. Final scoring begins.");
      finishGame();
      render();
      return;
    }

    state.prizeCards = [drawCard(), drawCard()];
    state.prizeCards.forEach((card, index) => {
      queueCardMotion({
        from: motionAnchor("main-deck"),
        to: motionPrizeCard(card.id),
        ghostHtml: renderMotionCard(card),
        duration: 820,
        delay: index * 150,
        variant: "draw",
      });
    });
    addLog(
      "round",
      `Fresh prize cards revealed: ${state.prizeCards.map((card) => formatCard(card)).join(" and ")}.`
    );

    state.phase = "cleanup";
    render();

    scheduleAction(900, beginNextRound);
  }

  function resolveCommittedSwaps() {
    const swapPlays = state.players
      .map((player) => ({ player, play: state.roundPlays[player.id] }))
      .filter(({ play }) => play.actionType === "swap" && play.swapCard);

    if (!swapPlays.length) {
      return;
    }

    let pool = shuffleDeck([
      ...state.effectPile,
      ...swapPlays.map(({ play }) => play.swapCard),
    ]);

    swapPlays.forEach(({ player, play }, index) => {
      queueCardMotion({
        from: motionAnchor(`round-attack-${player.id}`),
        to: motionAnchor("effects-deck"),
        ghostHtml: renderMotionCard(play.swapCard, { faceDown: true }),
        duration: 720,
        delay: index * 95,
        variant: "discard",
      });
    });

    const drawOrder = shuffleDeck(swapPlays.map(({ player }) => player.id));
    addLog(
      "cleanup",
      `${swapPlays.length} player${swapPlays.length === 1 ? "" : "s"} shuffle hidden swap cards into the Effects Deck and draw replacements.`
    );

    for (const playerId of drawOrder) {
      const player = getPlayerById(playerId);
      const replacement = pool.pop();
      if (!player || !replacement) {
        continue;
      }

      queueCardMotion({
        from: motionAnchor("effects-deck"),
        to: player.type === "human" ? motionHandCard(replacement.id) : motionAnchor(`hand-${player.id}`),
        ghostHtml: renderMotionCard(replacement, { faceDown: player.type !== "human" }),
        duration: 760,
        delay: drawOrder.indexOf(playerId) * 110 + 120,
        variant: "draw",
      });
      player.hand.push(replacement);
      player.swapsUsed += 1;
      addLog("cleanup", `${player.name} completes a face-down swap from the Effects Deck.`);
    }

    state.effectPile = pool;
  }

  function handleEndOfRoundRefills() {
    const newlyEmptyPlayers = state.players.filter(
      (player) => player.ownedCountAtRoundStart > 0 && getTotalOwnedCardCount(player) === 0
    );
    if (newlyEmptyPlayers.length >= 3) {
      addLog("end", "Three players emptied their hands in the same round. The game ends immediately.");
      finishGame("Three players emptied their hands in the same round.");
      return true;
    }

    const emptyPlayers = state.players.filter((player) => getTotalOwnedCardCount(player) === 0);
    if (!emptyPlayers.length) {
      return false;
    }

    let cardsPerPlayer = 0;
    if (emptyPlayers.length === 1) {
      cardsPerPlayer = state.effectPile.length >= 2 ? 2 : 0;
    } else {
      cardsPerPlayer = Math.min(2, Math.floor(state.effectPile.length / emptyPlayers.length));
    }

    if (cardsPerPlayer <= 0) {
      addLog(
        "cleanup",
        `${emptyPlayers.map((player) => player.name).join(", ")} wait for the Effects Deck to have enough cards to share evenly.`
      );
      return false;
    }

    state.effectPile = shuffleDeck(state.effectPile);
    for (const player of emptyPlayers) {
      const refillCards = [];
      for (let index = 0; index < cardsPerPlayer; index += 1) {
        const card = state.effectPile.pop();
        if (card) {
          queueCardMotion({
            from: motionAnchor("effects-deck"),
            to: player.type === "human" ? motionHandCard(card.id) : motionAnchor(`hand-${player.id}`),
            ghostHtml: renderMotionCard(card, { faceDown: player.type !== "human" }),
            duration: 760,
            delay: index * 100 + index * 20,
            variant: "draw",
          });
          refillCards.push(card);
        }
      }
      player.hand.push(...refillCards);
    }

    addLog(
      "cleanup",
      emptyPlayers.length === 1
        ? `${emptyPlayers[0].name} draws ${cardsPerPlayer} random card${cardsPerPlayer === 1 ? "" : "s"} from the face-down Effects Deck.`
        : `${emptyPlayers.map((player) => player.name).join(", ")} draw ${cardsPerPlayer} random card${cardsPerPlayer === 1 ? "" : "s"} each from the face-down Effects Deck.`
    );

    return false;
  }

  function beginNextRound() {
    if (state.gameOver) {
      return;
    }

    state.phase = "nextRound";
    state.roundNumber += 1;
    addLog("round", `Round ${state.roundNumber} begins.`);
    render();

    scheduleAction(240, prepareRound);
  }

  function finishGame(reasonText) {
    state.gameOver = true;
    state.phase = "gameOver";
    state.scheduledActions = [];
    state.pendingPlunderChoice = null;
    state.selectedPlunderCardId = null;

    const finalScore = scoreGame(state.players);
    state.finalScore = {
      ...finalScore,
      reasonText: reasonText || "",
    };

    const winners = finalScore.winners.map((winner) => winner.name);
    const winnerSummary =
      winners.length === 1 ? `${winners[0]} wins.` : `${winners.join(" and ")} share the victory.`;

    addLog("end", `${winnerSummary} Final counts settled.`);
  }

  function scoreGame(players) {
    const rows = players
      .map((player) => ({
        id: player.id,
        name: player.name,
        totalCount: getTotalOwnedCardCount(player),
        handCount: player.hand.length,
        reserveCount: player.reserve.length,
        specialCount: getOwnedCards(player).filter((card) => card.isSpecial).length,
        aceCount: getOwnedCards(player).filter((card) => card.rank === "A").length,
      }))
      .sort((left, right) => {
        if (right.totalCount !== left.totalCount) {
          return right.totalCount - left.totalCount;
        }

        if (right.specialCount !== left.specialCount) {
          return right.specialCount - left.specialCount;
        }

        if (right.aceCount !== left.aceCount) {
          return right.aceCount - left.aceCount;
        }

        return getPlayerOrderIndex(left.id) - getPlayerOrderIndex(right.id);
      });

    const best = rows[0];
    const winners = rows.filter(
      (row) =>
        row.totalCount === best.totalCount &&
        row.specialCount === best.specialCount &&
        row.aceCount === best.aceCount
    );

    return { rows, winners };
  }

  function scheduleAction(delayMs, callback) {
    state.scheduledActions.push({
      id: state.scheduledActionSeq += 1,
      at: state.nowMs + delayMs,
      callback,
    });

    state.scheduledActions.sort((left, right) => {
      if (left.at !== right.at) {
        return left.at - right.at;
      }

      return left.id - right.id;
    });
  }

  function advanceGameTime(deltaMs) {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return;
    }

    state.nowMs += deltaMs;

    while (state.scheduledActions.length && state.scheduledActions[0].at <= state.nowMs) {
      const action = state.scheduledActions.shift();
      action.callback();
    }
  }

  function resetToStartScreen() {
    state.gameStarted = false;
    state.roundNumber = 1;
    state.phase = "start";
    state.playerCount = Number(refs.playerCount.value || "4");
    state.players = [];
    state.deck = [];
    state.bottomDeckBuffer = [];
    state.prizeCards = [];
    state.effectPile = [];
    state.jailDeck = [];
    state.roundPlays = {};
    state.winnerPlayerId = null;
    state.eventLog = [];
    state.gameOver = false;
    state.finalScore = null;
    state.rulesOpen = false;
    state.pendingPlunderChoice = null;
    state.selectedPlunderCardId = null;
    state.scheduledActions = [];
    state.scheduledActionSeq = 0;
    state.nowMs = 0;
    state.lastFrameTs = null;
    state.automationMode = false;
    state.aiTurnsScheduled = false;
    state.focusedHandIndex = 0;
    state.focusedTargetIndex = 0;
    state.focusedPlunderIndex = 0;
    motionState.pending = [];
    if (motionState.rafHandle) {
      cancelAnimationFrame(motionState.rafHandle);
      motionState.rafHandle = null;
    }
    motionState.timers.forEach((timerId) => clearTimeout(timerId));
    motionState.timers = [];
    if (refs.cardMotionLayer) {
      refs.cardMotionLayer.innerHTML = "";
    }
    render();
  }

  function getHumanPlayer() {
    return state.players.find((player) => player.type === "human") || null;
  }

  function getPlayerById(playerId) {
    return state.players.find((player) => player.id === playerId) || null;
  }

  function getPlayerOrderIndex(playerId) {
    return state.players.findIndex((player) => player.id === playerId);
  }

  function getSuitMetadata(suitKey) {
    return SUITS.find((suit) => suit.key === suitKey) || SUITS[0];
  }

  function getRankLabelForValue(rankValue) {
    return RANK_LABEL_BY_VALUE.get(Math.min(MAX_RANK_VALUE, rankValue)) || String(rankValue);
  }

  function getEffectiveAttackRankValue(attackCard, supportCard) {
    if (!attackCard) {
      return null;
    }

    if (!supportCard || supportCard.rank !== "J") {
      return attackCard.rankValue;
    }

    return Math.min(MAX_RANK_VALUE, attackCard.rankValue + 2);
  }

  function getBoostedRankLabel(attackCard) {
    if (!attackCard) {
      return "";
    }

    return getRankLabelForValue(Math.min(MAX_RANK_VALUE, attackCard.rankValue + 2));
  }

  function getAnalysisRankValue(analysis) {
    return analysis?.effectiveRankValue ?? analysis?.attackCard?.rankValue ?? 0;
  }

  function formatRankBattleCard(analysis) {
    const attackCard = analysis?.attackCard;
    if (!attackCard) {
      return "Unknown attack";
    }

    if (!analysis?.usedJackBoost) {
      return formatCard(attackCard);
    }

    return `${analysis.effectiveRankLabel}${attackCard.suitSymbol} (boosted from ${formatCard(attackCard)})`;
  }

  function formatCard(card) {
    return card ? `${card.rank}${card.suitSymbol}` : "Unknown card";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeSelectorValue(value) {
    return typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(String(value))
      : String(value).replace(/["\\]/g, "\\$&");
  }

  function getMotionElement(descriptor) {
    if (!descriptor) {
      return null;
    }

    if (descriptor.startsWith("anchor:")) {
      const anchorKey = descriptor.slice("anchor:".length);
      return document.querySelector(`[data-motion-anchor="${escapeSelectorValue(anchorKey)}"]`);
    }

    if (descriptor.startsWith("card:hand:")) {
      const cardId = descriptor.slice("card:hand:".length);
      return document.querySelector(`[data-hand-card-id="${escapeSelectorValue(cardId)}"]`);
    }

    if (descriptor.startsWith("card:prize:")) {
      const cardId = descriptor.slice("card:prize:".length);
      return document.querySelector(
        `[data-motion-zone="prize"][data-motion-card-id="${escapeSelectorValue(cardId)}"]`
      );
    }

    return null;
  }

  function getElementMotionRect(element) {
    if (!element) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    return rect;
  }

  function queueCardMotion({
    from,
    to,
    ghostHtml = "",
    duration = 420,
    delay = 0,
    variant = "travel",
  }) {
    if (!ghostHtml) {
      return;
    }

    motionState.pending.push({
      id: `motion-${motionState.sequence += 1}`,
      from,
      sourceRect: getElementMotionRect(getMotionElement(from)),
      to,
      ghostHtml,
      duration,
      delay,
      variant,
    });
  }

  function flushCardMotions() {
    if (!refs.cardMotionLayer || !motionState.pending.length) {
      return;
    }

    const motions = motionState.pending.splice(0);
    if (motionState.rafHandle) {
      cancelAnimationFrame(motionState.rafHandle);
    }

    motionState.rafHandle = requestAnimationFrame(() => {
      motionState.rafHandle = null;
      motions.forEach((motion) => {
        const timerId = setTimeout(() => {
          motionState.timers = motionState.timers.filter((candidate) => candidate !== timerId);
          playCardMotion(motion);
        }, Math.max(0, motion.delay || 0));
        motionState.timers.push(timerId);
      });
    });
  }

  function playCardMotion(motion) {
    const sourceRect =
      motion.sourceRect || getElementMotionRect(getMotionElement(motion.from));
    const targetElement = getMotionElement(motion.to);
    const targetRect = getElementMotionRect(targetElement);
    if (!sourceRect || !targetRect) {
      return;
    }

    const ghost = document.createElement("div");
    ghost.className = `card-motion-ghost motion-${escapeHtml(motion.variant || "travel")}`;
    ghost.innerHTML = motion.ghostHtml;

    const scaleX = targetRect.width / sourceRect.width;
    const scaleY = targetRect.height / sourceRect.height;
    const deltaX = targetRect.left - sourceRect.left;
    const deltaY = targetRect.top - sourceRect.top;
    const variantSettings = getMotionVariantSettings(motion.variant, deltaX, deltaY);
    const tilt = variantSettings.tilt;
    const midTranslateX = deltaX * variantSettings.midpoint;
    const midTranslateY = deltaY * variantSettings.midpoint - variantSettings.arc;
    const midScaleX = (1 + (scaleX - 1) * variantSettings.scaleMidpoint) * variantSettings.liftScale;
    const midScaleY = (1 + (scaleY - 1) * variantSettings.scaleMidpoint) * variantSettings.liftScale;
    const shouldHideTarget = motion.hideTarget ?? shouldHideMotionTarget(motion.to);

    if (shouldHideTarget && targetElement) {
      targetElement.classList.add("motion-target-hidden");
      const revealTimerId = setTimeout(() => {
        motionState.timers = motionState.timers.filter((candidate) => candidate !== revealTimerId);
        targetElement.classList.remove("motion-target-hidden");
        targetElement.classList.add("motion-target-reveal");
        const clearRevealTimerId = setTimeout(() => {
          motionState.timers = motionState.timers.filter((candidate) => candidate !== clearRevealTimerId);
          targetElement.classList.remove("motion-target-reveal");
        }, 260);
        motionState.timers.push(clearRevealTimerId);
      }, Math.max(80, motion.duration - 140));
      motionState.timers.push(revealTimerId);
    }

    Object.assign(ghost.style, {
      left: `${sourceRect.left}px`,
      top: `${sourceRect.top}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      "--motion-translate-x": `${deltaX}px`,
      "--motion-translate-y": `${deltaY}px`,
      "--motion-mid-translate-x": `${midTranslateX}px`,
      "--motion-mid-translate-y": `${midTranslateY}px`,
      "--motion-scale-x": `${scaleX}`,
      "--motion-scale-y": `${scaleY}`,
      "--motion-mid-scale-x": `${midScaleX}`,
      "--motion-mid-scale-y": `${midScaleY}`,
      "--motion-tilt": `${tilt}deg`,
      "--motion-duration": `${motion.duration}ms`,
      "--motion-final-opacity": `${variantSettings.finalOpacity}`,
      "--motion-ease": variantSettings.easing,
    });

    refs.cardMotionLayer.appendChild(ghost);

    requestAnimationFrame(() => {
      ghost.classList.add("running");
    });

    const cleanup = () => {
      ghost.removeEventListener("transitionend", cleanup);
      ghost.removeEventListener("animationend", cleanup);
      ghost.remove();
    };

    ghost.addEventListener("animationend", cleanup);
    ghost.addEventListener("transitionend", cleanup);
    setTimeout(cleanup, motion.duration + 120);
  }

  function shouldHideMotionTarget(descriptor) {
    return Boolean(
      descriptor &&
        (
          descriptor.startsWith("card:hand:") ||
          descriptor.startsWith("card:prize:") ||
          descriptor.startsWith("anchor:round-attack-") ||
          descriptor.startsWith("anchor:round-support-")
        )
    );
  }

  function getMotionVariantSettings(variant, deltaX, deltaY) {
    const distance = Math.hypot(deltaX, deltaY);
    const baseTilt = Math.max(-10, Math.min(10, deltaX / 24));
    const arcBase = Math.min(56, Math.max(14, distance * 0.12));

    switch (variant) {
      case "deal":
        return {
          tilt: baseTilt * 0.55,
          arc: arcBase * 1.15,
          midpoint: 0.5,
          scaleMidpoint: 0.42,
          liftScale: 1.14,
          finalOpacity: 0.94,
          easing: "cubic-bezier(0.12, 0.92, 0.2, 1)",
        };
      case "submit":
        return {
          tilt: baseTilt,
          arc: arcBase * 1.25,
          midpoint: 0.48,
          scaleMidpoint: 0.5,
          liftScale: 1.08,
          finalOpacity: 0.88,
          easing: "cubic-bezier(0.22, 0.9, 0.28, 1)",
        };
      case "capture":
        return {
          tilt: baseTilt * 1.15,
          arc: arcBase * 1.65,
          midpoint: 0.54,
          scaleMidpoint: 0.55,
          liftScale: 1.18,
          finalOpacity: 0.82,
          easing: "cubic-bezier(0.16, 0.94, 0.26, 1)",
        };
      case "banish":
        return {
          tilt: baseTilt + Math.sign(deltaX || 1) * 8,
          arc: arcBase * 0.9,
          midpoint: 0.6,
          scaleMidpoint: 0.62,
          liftScale: 1.04,
          finalOpacity: 0.46,
          easing: "cubic-bezier(0.3, 0.06, 0.76, 0.94)",
        };
      case "reserve":
        return {
          tilt: baseTilt * 0.7,
          arc: arcBase * 0.95,
          midpoint: 0.52,
          scaleMidpoint: 0.46,
          liftScale: 1.1,
          finalOpacity: 0.8,
          easing: "cubic-bezier(0.18, 0.84, 0.3, 1)",
        };
      case "discard":
        return {
          tilt: baseTilt * 0.9,
          arc: arcBase * 1.05,
          midpoint: 0.5,
          scaleMidpoint: 0.5,
          liftScale: 1.06,
          finalOpacity: 0.72,
          easing: "cubic-bezier(0.2, 0.78, 0.3, 1)",
        };
      case "draw":
      default:
        return {
          tilt: baseTilt * 0.6,
          arc: arcBase * 1.35,
          midpoint: 0.48,
          scaleMidpoint: 0.44,
          liftScale: 1.16,
          finalOpacity: 0.94,
          easing: "cubic-bezier(0.12, 0.9, 0.2, 1)",
        };
    }
  }

  function motionAnchor(anchorKey) {
    return `anchor:${anchorKey}`;
  }

  function motionHandCard(cardId) {
    return `card:hand:${cardId}`;
  }

  function motionPrizeCard(cardId) {
    return `card:prize:${cardId}`;
  }

  function renderHudChip(label, value, className = "", title = "") {
    return `
      <div class="player-chip ${escapeHtml(className)}"${title ? ` title="${escapeHtml(title)}"` : ""}>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function renderTagRow(tags) {
    if (!tags.length) {
      return "";
    }

    return `
      <div class="selection-tags">
        ${tags.map((tag) => `<span class="selection-tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
    `;
  }

  function addLog(type, message) {
    state.eventLog.push({
      id: `${state.roundNumber}-${state.eventLog.length + 1}`,
      roundNumber: state.roundNumber,
      type,
      message,
      at: state.nowMs,
    });
  }

  function handleChooseKeyboard(event) {
    const human = getHumanPlayer();
    if (!human || human.lockedIn) {
      return;
    }

    const key = event.key;
    if (key.toLowerCase() === "d") {
      event.preventDefault();
      drawForHumanPlayer();
      return;
    }

    if (!human.hand.length) {
      return;
    }

    if (key === "ArrowLeft") {
      event.preventDefault();
      moveFocusedHandCard(-1);
      return;
    }

    if (key === "ArrowRight") {
      event.preventDefault();
      moveFocusedHandCard(1);
      return;
    }

    if (key === "ArrowUp" || key === "ArrowDown") {
      const selectedSupport = human.hand.find((card) => card.id === human.selectedSupportCardId);
      if (selectedSupport && selectedSupport.rank === "2") {
        event.preventDefault();
        moveSabotageTarget(key === "ArrowUp" ? -1 : 1);
      } else if (selectedSupport && selectedSupport.rank === "8") {
        event.preventDefault();
        cycleHumanWild8Mode(key === "ArrowUp" ? -1 : 1);
      }
      return;
    }

    if (key.toLowerCase() === "a") {
      event.preventDefault();
      const card = human.hand[state.focusedHandIndex];
      if (card) {
        selectHumanCard(card.id, "attack");
      }
      return;
    }

    if (key.toLowerCase() === "b") {
      event.preventDefault();
      const card = human.hand[state.focusedHandIndex];
      if (card) {
        selectHumanCard(card.id, "support");
      }
      return;
    }

    if (key.toLowerCase() === "s") {
      event.preventDefault();
      const card = human.hand[state.focusedHandIndex];
      if (card) {
        selectHumanCard(card.id, "swap");
      }
      return;
    }

    if (key === "Enter" || key === " ") {
      event.preventDefault();
      lockInHumanPlay();
    }
  }

  function handlePlunderKeyboard(event) {
    if (!state.pendingPlunderChoice?.options.length) {
      return;
    }

    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowUp") {
      event.preventDefault();
      movePlunderFocus(-1);
      return;
    }

    if (key === "ArrowRight" || key === "ArrowDown") {
      event.preventDefault();
      movePlunderFocus(1);
      return;
    }

    if (key === "Enter" || key === " ") {
      event.preventDefault();
      confirmHumanPlunder();
    }
  }

  function moveFocusedHandCard(direction) {
    const human = getHumanPlayer();
    if (!human || !human.hand.length) {
      return;
    }

    state.focusedHandIndex =
      (state.focusedHandIndex + direction + human.hand.length) % human.hand.length;
    render();
  }

  function moveSabotageTarget(direction) {
    const human = getHumanPlayer();
    if (!human) {
      return;
    }

    const targets = state.players.filter((player) => player.id !== human.id);
    if (!targets.length) {
      return;
    }

    const currentIndex = Math.max(
      0,
      targets.findIndex((player) => player.id === human.selectedSupportTargetPlayerId)
    );
    const nextIndex = (currentIndex + direction + targets.length) % targets.length;
    human.selectedSupportTargetPlayerId = targets[nextIndex].id;
    state.focusedTargetIndex = nextIndex;
    render();
  }

  function cycleHumanWild8Mode(direction) {
    const human = getHumanPlayer();
    if (!human) {
      return;
    }

    const currentIndex = Math.max(0, WILD_8_MODES.indexOf(human.selectedWild8Mode || WILD_8_MODES[0]));
    const nextIndex = (currentIndex + direction + WILD_8_MODES.length) % WILD_8_MODES.length;
    human.selectedWild8Mode = WILD_8_MODES[nextIndex];
    render();
  }

  function movePlunderFocus(direction) {
    const options = state.pendingPlunderChoice?.options || [];
    if (!options.length) {
      return;
    }

    state.focusedPlunderIndex =
      (state.focusedPlunderIndex + direction + options.length) % options.length;
    state.selectedPlunderCardId = options[state.focusedPlunderIndex].card.id;
    render();
  }

  function render() {
    refs.startScreen.classList.toggle("hidden", state.gameStarted);
    refs.gameScreen.classList.toggle("hidden", !state.gameStarted);
    refs.restartButton.classList.toggle("hidden", !state.gameStarted);

    renderStatusBar();
    renderResultBanner();
    renderPrizeCards();
    renderRoundCommitments();
    renderOpponents();
    renderPlayerArea();
    renderEventLog();
    renderRulesModal();
    renderPlunderModal();
    renderEndgameModal();
    flushCardMotions();
    state.renderTick += 1;
  }

  function renderStatusBar() {
    if (!state.gameStarted) {
      refs.statusBar.innerHTML = "";
      refs.mainDeckCount.textContent = "0";
      refs.effectsDeckCount.textContent = "0";
      refs.jailDeckCount.textContent = "0";
      return;
    }

    refs.mainDeckCount.textContent = String(state.deck.length);
    refs.effectsDeckCount.textContent = String(state.effectPile.length);
    refs.jailDeckCount.textContent = String(state.jailDeck.length);

    const pills = [
      ["Round", state.roundNumber],
      ["Phase", PHASE_LABELS[state.phase] || state.phase],
      ["Players", state.playerCount],
      ["Hand limit", getHandLimit()],
    ];

    refs.statusBar.innerHTML = pills
      .map(
        ([label, value]) =>
          `<div class="status-pill"><span>${escapeHtml(label)}</span>${escapeHtml(value)}</div>`
      )
      .join("");
  }

  function renderResultBanner() {
    if (!state.gameStarted) {
      refs.resultBanner.textContent = "Choose cards";
      return;
    }

    if (state.gameOver && state.finalScore) {
      const winners = state.finalScore.winners.map((winner) => winner.name);
      refs.resultBanner.textContent =
        winners.length === 1 ? `${winners[0]} wins the game` : `${winners.join(" and ")} share the win`;
      return;
    }

    if (state.pendingPlunderChoice) {
      refs.resultBanner.textContent = `${state.pendingPlunderChoice.winnerAnalysis.name} may plunder a losing attack`;
      return;
    }

    if (state.winnerPlayerId) {
      const winner = getPlayerById(state.winnerPlayerId);
      refs.resultBanner.textContent = winner ? `${winner.name} wins the round` : "Round resolved";
      return;
    }

    refs.resultBanner.textContent = PHASE_LABELS[state.phase] || "Choose cards";
  }

  function renderPrizeCards() {
    refs.prizeCards.innerHTML = state.prizeCards.length
      ? state.prizeCards
          .map(
            (card) => `
              <div
                class="prize-card-node"
                data-motion-zone="prize"
                data-motion-card-id="${escapeHtml(card.id)}"
              >
                ${renderMiniCard(card)}
              </div>
            `
          )
          .join("")
      : `<div class="placeholder">No prize cards in the center.</div>`;
  }

  function renderRoundCommitments() {
    if (!state.gameStarted) {
      refs.roundCommitments.innerHTML = "";
      return;
    }

    refs.roundCommitments.innerHTML = state.players
      .map((player) => {
        const play = state.roundPlays[player.id];
        const supportCard = play?.supportCard;
        const attackCard = play?.attackCard;
        const isSwap = play?.actionType === "swap";
        const isPass = play?.actionType === "pass";
        const showAttack = shouldShowAttackCard(play);
        const supportNote = getSupportCommitmentNote(play);
        const attackNote = getAttackCommitmentNote(play, showAttack);
        const winnerPulse = player.id === state.winnerPulsePlayerId ? "winner-pulse" : "";
        const flipClass = state.revealPulsePlayerIds.includes(player.id) ? "card-flip" : "";
        const revealPulse = state.revealPulsePlayerIds.includes(player.id) ? "reveal-pulse" : "";
        return `
          <div class="round-entry ${player.id === state.winnerPlayerId ? "winner" : ""} ${winnerPulse}">
            <div class="round-entry-head">
              <div class="round-entry-name">${escapeHtml(player.name)}</div>
            </div>
            <div class="round-entry-cards">
              <div class="round-slot">
                <span class="round-slot-label">SUP</span>
                <div data-motion-anchor="${escapeHtml(`round-support-${player.id}`)}">
                  ${
                  supportCard
                    ? `<div class="tooltip-anchor" data-tooltip="${escapeHtml(getSupportTooltip(supportCard))}">${renderMiniCard(supportCard)}</div>`
                    : isSwap
                    ? renderMiniActionChip("FX", "swap")
                    : renderMiniGhostCard("SUP")
                  }
                </div>
                <div class="round-slot-note ${!supportNote ? "muted" : ""}">${escapeHtml(supportNote || "")}</div>
              </div>
              <div class="round-slot">
                <span class="round-slot-label">ATK</span>
                <div data-motion-anchor="${escapeHtml(`round-attack-${player.id}`)}" class="${escapeHtml(revealPulse)}">
                  ${
                    isSwap
                      ? renderMiniActionChip("FX", "swap")
                    : isPass
                    ? renderMiniActionChip("OUT", "pass")
                    : attackCard
                    ? showAttack
                      ? `<div class="${escapeHtml(flipClass)}">${renderMiniCard(attackCard)}</div>`
                      : renderFaceDownCard()
                    : renderMiniGhostCard("ATK")
                  }
                </div>
                <div class="round-slot-note ${!attackNote ? "muted" : ""}">${escapeHtml(attackNote || "")}</div>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function shouldShowAttackCard(play) {
    return Boolean(
      play?.attackCard &&
        (play.revealed || state.phase === "resolve" || state.phase === "cleanup" || state.phase === "gameOver")
    );
  }

  function getSeatAssignments() {
    const aiPlayers = state.players.filter((player) => player.type === "ai");
    const seatOrder =
      aiPlayers.length === 1 ? ["north"] : aiPlayers.length === 2 ? ["west", "east"] : ["north", "west", "east"];
    const assignments = { north: null, west: null, east: null };

    aiPlayers.forEach((player, index) => {
      assignments[seatOrder[index]] = player;
    });

    return assignments;
  }

  function renderMiniGhostCard(label) {
    return `<div class="mini-card mini-ghost">${escapeHtml(label)}</div>`;
  }

  function renderMiniActionChip(label, tone) {
    return `<div class="mini-card mini-action ${escapeHtml(tone || "")}">${escapeHtml(label)}</div>`;
  }

  function renderSeatHandFan(count) {
    if (!count) {
      return `<div class="seat-hand-empty">0</div>`;
    }

    const visibleCount = Math.min(count, 5);
    const cards = Array.from({ length: visibleCount }, (_, index) => {
      return `<span class="seat-hand-card" style="--seat-card-index:${index};"></span>`;
    }).join("");
    const overflow = count > visibleCount ? `<span class="seat-hand-more">+${count - visibleCount}</span>` : "";

    return `<div class="seat-hand-visual">${cards}${overflow}</div>`;
  }

  function getSupportTooltip(card) {
    if (!card?.isSpecial) {
      return "";
    }

    switch (card.rank) {
      case "2":
        return "If you win and the chosen target loses, their attack goes to Jail.";
      case "7":
        return "If you win, plunder one losing attack card.";
      case "8":
        return "Choose rank-match to copy the highest prize rank, or suit-match to copy the best prize suit.";
      case "J":
        return "Boost this attack by +2 rank, up to Ace.";
      case "Q":
        return "If you win, every losing attack is banished to Jail.";
      case "K":
        return "If you win, every reserve pile loses 1 random card to Jail.";
      case "A":
        return "Shift this attack to the Ace's suit for the round.";
      default:
        return "";
    }
  }

  function getSupportCommitmentNote(play) {
    if (!play?.supportCard) {
      return "";
    }

    const supportCard = play.supportCard;
    if (supportCard.rank === "2" && play.supportTargetPlayerId) {
      return getPlayerById(play.supportTargetPlayerId)?.name || "Target";
    }

    if (supportCard.rank === "8" && play.wild8Mode) {
      return play.wild8Mode === "rank-match" ? "RANK" : "SUIT";
    }

    if (supportCard.rank === "J" && play.attackCard) {
      return `+2 ${getBoostedRankLabel(play.attackCard)}`;
    }

    if (supportCard.rank === "A") {
      return getSuitMetadata(supportCard.suit).symbol;
    }

    return "";
  }

  function getAttackCommitmentNote(play, showAttack) {
    if (!play?.attackCard) {
      return "";
    }

    if (!showAttack) {
      return "";
    }

    if (!play.legal) {
      return "MISS";
    }

    if (play.matchType === "suit-match") {
      return "SUIT";
    }

    if (play.matchType === "rank-match") {
      return "RANK";
    }

    return play.matchType || "";
  }

  function renderSeatPanel(player, seatKey) {
    if (!player) {
      return `
        <div class="seat-card seat-empty">
          <div class="seat-empty-mark">${escapeHtml(seatKey.toUpperCase())}</div>
        </div>
      `;
    }

    const play = state.roundPlays[player.id] || {};
    const supportCard = play.supportCard;
    const attackCard = play.attackCard;
    const showAttack = shouldShowAttackCard(play);
    const note = getSupportCommitmentNote(play) || getAttackCommitmentNote(play, showAttack);
    const flipClass = state.revealPulsePlayerIds.includes(player.id) ? "card-flip" : "";
    const revealPulse = state.revealPulsePlayerIds.includes(player.id) ? "reveal-pulse" : "";
    const winnerPulse = player.id === state.winnerPulsePlayerId ? "winner-pulse" : "";
    const statusPills = [
      player.lockedIn ? "LOCK" : "",
      play.actionType === "swap" ? "FX" : "",
      play.actionType === "pass" ? "OUT" : "",
      player.wonLastRound ? "WIN" : "",
    ]
      .filter(Boolean)
      .map((label) => `<span class="seat-state">${escapeHtml(label)}</span>`)
      .join("");

    return `
      <article class="seat-card ${player.id === state.winnerPlayerId ? "winner" : ""} ${player.wonLastRound ? "won-last-round" : ""} ${winnerPulse}">
        <div class="seat-topline">
          <div>
            <div class="seat-name">${escapeHtml(player.name)}</div>
            <div class="seat-state-row">${statusPills}</div>
          </div>
          <div class="seat-counters">
            <span class="seat-counter" title="Hand">H${escapeHtml(player.hand.length)}</span>
            <span class="seat-counter reserve" title="Reserve" data-motion-anchor="${escapeHtml(`reserve-${player.id}`)}">R${escapeHtml(player.reserve.length)}</span>
          </div>
        </div>
        <div data-motion-anchor="${escapeHtml(`hand-${player.id}`)}">
          ${renderSeatHandFan(player.hand.length)}
        </div>
        <div class="seat-commit-row">
          <div class="seat-commit-slot" title="Support">
            ${
              supportCard
                ? `<div class="tooltip-anchor" data-tooltip="${escapeHtml(getSupportTooltip(supportCard))}">${renderMiniCard(supportCard)}</div>`
                : play.actionType === "swap"
                ? renderMiniActionChip("FX", "swap")
                : renderMiniGhostCard("SUP")
            }
          </div>
          <div class="seat-commit-slot" title="Attack">
            <div class="${escapeHtml(revealPulse)}">
            ${
              play.actionType === "swap"
                ? renderMiniActionChip("FX", "swap")
                : play.actionType === "pass"
                ? renderMiniActionChip("OUT", "pass")
                : attackCard
                ? showAttack
                  ? `<div class="${escapeHtml(flipClass)}">${renderMiniCard(attackCard)}</div>`
                  : renderFaceDownCard()
                : renderMiniGhostCard("ATK")
            }
            </div>
          </div>
        </div>
        <div class="seat-note ${!note ? "muted" : ""}">${escapeHtml(note || "")}</div>
      </article>
    `;
  }

  function renderOpponents() {
    if (!state.gameStarted) {
      refs.northSeat.innerHTML = "";
      refs.westSeat.innerHTML = "";
      refs.eastSeat.innerHTML = "";
      return;
    }

    const seats = getSeatAssignments();
    refs.northSeat.innerHTML = renderSeatPanel(seats.north, "north");
    refs.westSeat.innerHTML = renderSeatPanel(seats.west, "west");
    refs.eastSeat.innerHTML = renderSeatPanel(seats.east, "east");
  }

  function renderPlayerArea() {
    if (!state.gameStarted) {
      delete refs.playerHandStage.dataset.motionAnchor;
      delete refs.reserveCards.dataset.motionAnchor;
      refs.playerSummary.innerHTML = "";
      refs.supportTargetPanel.innerHTML = "";
      refs.supportTargetPanel.classList.add("hidden");
      refs.validationMessage.textContent = "";
      refs.validationMessage.classList.add("hidden");
      refs.handCards.innerHTML = "";
      refs.swapPreview.innerHTML = "";
      refs.reserveSummary.innerHTML = "";
      refs.reserveCards.innerHTML = "";
      return;
    }

    const human = getHumanPlayer();
    const validation = getHumanValidation();
    const preview = getHumanSelectedPlayPreview();
    const handLimit = getHandLimit();
    const readyReserveEntries = getReadyReserveEntries(human);
    const lockedReserveCount = human.reserve.length - readyReserveEntries.length;
    refs.playerHandStage.dataset.motionAnchor = `hand-${human.id}`;
    refs.reserveCards.dataset.motionAnchor = `reserve-${human.id}`;
    if (human.hand.length) {
      state.focusedHandIndex = Math.min(state.focusedHandIndex, human.hand.length - 1);
    } else {
      state.focusedHandIndex = 0;
    }

    refs.playerSummary.innerHTML = `
      <div class="player-chip-row player-chip-row-hud">
        ${renderHudChip(human.name, "YOU", "seat", "South seat")}
        ${renderHudChip("H", `${human.hand.length}/${handLimit}`, "", "Hand / limit")}
        ${renderHudChip("R", human.reserve.length, "", "Reserve")}
        ${renderHudChip("D", Math.max(0, 2 - human.drawsUsed), "", "Deck draws left")}
        ${renderHudChip("FX", Math.max(0, 3 - human.swapsUsed), "", "Effects swaps left")}
      </div>
      <div class="player-legend" aria-label="controls">
        <span class="legend-key" title="Left click attack">L ATK</span>
        <span class="legend-key" title="Right click support">R SUP</span>
        <span class="legend-key" title="Shift click swap">SHIFT FX</span>
        <span class="legend-key" title="Draw one from main deck">D +1</span>
      </div>
    `;

    const showValidation = !human.lockedIn && (validation.warning || (!validation.ok && Boolean(validation.message)));
    refs.validationMessage.textContent = showValidation ? validation.message : "";
    refs.validationMessage.classList.toggle("warning", validation.warning);
    refs.validationMessage.classList.toggle("hidden", !showValidation);

    const needsSabotageTarget =
      !human.lockedIn &&
      human.selectedSupportCardId &&
      human.hand.find((card) => card.id === human.selectedSupportCardId)?.rank === "2";
    const needsWild8Mode =
      !human.lockedIn &&
      human.selectedSupportCardId &&
      human.hand.find((card) => card.id === human.selectedSupportCardId)?.rank === "8";

    refs.supportTargetPanel.classList.toggle("hidden", !needsSabotageTarget && !needsWild8Mode);
    if (needsSabotageTarget) {
      refs.supportTargetPanel.innerHTML = `
        <div class="choice-ribbon">
          <span class="choice-label">Target</span>
          <div class="target-buttons">
            ${state.players
              .filter((player) => player.id !== human.id)
              .map(
                (player) => `
                  <button
                    type="button"
                    class="mode-button ${human.selectedSupportTargetPlayerId === player.id ? "selected" : ""}"
                    data-target-player-id="${escapeHtml(player.id)}"
                  >
                    ${escapeHtml(player.name)}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      `;
    } else if (needsWild8Mode) {
      refs.supportTargetPanel.innerHTML = `
        <div class="choice-ribbon">
          <span class="choice-label">8 mode</span>
          <div class="target-buttons">
            ${WILD_8_MODES.map(
              (mode) => `
                <button
                  type="button"
                  class="mode-button ${human.selectedWild8Mode === mode ? "selected" : ""}"
                  data-wild8-mode="${escapeHtml(mode)}"
                >
                  ${escapeHtml(mode)}
                </button>
              `
            ).join("")}
          </div>
        </div>
      `;
    } else {
      refs.supportTargetPanel.innerHTML = "";
    }

    refs.clearSelectionButton.disabled = human.lockedIn || state.phase !== "choose";
    refs.drawCardButton.disabled = !canPlayerDrawFromDeck(human);
    refs.lockInButton.disabled = human.lockedIn || state.phase !== "choose" || !validation.ok;

    const swapPreviewCard = human.lockedIn
      ? state.roundPlays[human.id]?.actionType === "swap"
        ? state.roundPlays[human.id]?.swapCard || null
        : null
      : preview.swapCard;

    const visibleHand = human.hand.filter((card) => card.id !== human.selectedSwapCardId);

    refs.handCards.innerHTML = visibleHand.length
      ? visibleHand
          .map((card) => {
            const attackSelected = human.selectedAttackCardId === card.id;
            const supportSelected = human.selectedSupportCardId === card.id;
            const focused = visibleHand[Math.min(state.focusedHandIndex, visibleHand.length - 1)]?.id === card.id;
            const tooltip = getSupportTooltip(card);
            const title = [
              "Left click: attack.",
              card.isSpecial ? "Right click: support." : "",
              "Shift+click: swap.",
              tooltip,
            ]
              .filter(Boolean)
              .join(" ");

            return `
              <article
                class="card-tile ${attackSelected ? "selected-attack" : ""} ${supportSelected ? "selected-support" : ""} ${focused ? "focused" : ""} ${card.isSpecial ? "has-tooltip" : ""}"
                data-hand-card-id="${escapeHtml(card.id)}"
                data-motion-card-id="${escapeHtml(card.id)}"
                data-motion-zone="hand"
                ${tooltip ? `data-tooltip="${escapeHtml(tooltip)}"` : ""}
                title="${escapeHtml(title)}"
              >
                ${renderCardFace(card)}
                <div class="card-badges">
                  ${card.isSpecial ? `<span class="card-badge badge-special">${escapeHtml(card.rank)}</span>` : ""}
                  ${attackSelected ? `<span class="card-badge badge-attack">ATK</span>` : ""}
                  ${supportSelected ? `<span class="card-badge badge-support">SUP</span>` : ""}
                  ${focused ? `<span class="card-badge badge-focus">FOCUS</span>` : ""}
                </div>
              </article>
            `;
          })
          .join("")
      : `<div class="placeholder">No cards left in hand.</div>`;

    refs.swapPreview.innerHTML = swapPreviewCard
      ? `
          <div class="swap-preview-wrap">
            <span class="swap-preview-label">${escapeHtml(human.lockedIn ? "LOCK FX" : "FX")}</span>
            <article class="card-tile swap-preview-card ${human.lockedIn ? "locked" : "selected-swap"}">
              ${renderCardFace(swapPreviewCard)}
              <div class="card-badges">
                <span class="card-badge badge-swap">FX</span>
              </div>
            </article>
          </div>
        `
      : "";

    refs.reserveSummary.innerHTML = human.reserve.length
      ? `
          <div class="player-chip-row compact">
            ${renderHudChip("RDY", readyReserveEntries.length, "", "Ready reserve cards")}
            ${renderHudChip("LOCK", lockedReserveCount, "", "Reserve cards still locked")}
          </div>
        `
      : `<div class="reserve-empty-copy">No reserve yet.</div>`;

    const canDrawReserve = canPlayerDrawFromReserve(human);
    const reserveHint = !human.reserve.length
      ? ""
      : canDrawReserve
      ? "Draw 1 random reserve card."
      : human.reserveDrawEligibleThisRound
      ? human.hand.length >= handLimit
        ? "Hand full."
        : "Ready cards hidden."
      : "Opens at 3 or less.";

    refs.reserveCards.innerHTML = human.reserve.length
      ? `
          <button
            type="button"
            class="reserve-pile ${canDrawReserve ? "ready" : ""}"
            data-reserve-action="draw"
            title="${escapeHtml(reserveHint)}"
            ${canDrawReserve ? "" : "disabled"}
          >
            <span class="reserve-stack-layer"></span>
            <span class="reserve-stack-layer mid"></span>
            <span class="reserve-stack-layer top"></span>
            <span class="reserve-pile-count">${escapeHtml(human.reserve.length)}</span>
            <span class="reserve-pile-note">${escapeHtml(canDrawReserve ? "DRAW 1" : reserveHint)}</span>
          </button>
        `
      : `<div class="placeholder">Overflow cards bank here face down.</div>`;
  }

  function renderSelectionSocket(role, label, content, extraClass) {
    return `
      <div class="selection-socket ${escapeHtml(extraClass || "")}" data-drop-role="${escapeHtml(role)}" title="Drop a card here">
        <span class="selection-label">${escapeHtml(label)}</span>
        <div class="selection-card">${content}</div>
      </div>
    `;
  }

  function renderEventLog() {
    refs.eventLog.innerHTML = state.eventLog
      .map(
        (entry) => `
          <div class="log-entry">
            <div class="log-meta">R${escapeHtml(entry.roundNumber)} • ${escapeHtml(entry.type)}</div>
            <div>${escapeHtml(entry.message)}</div>
          </div>
        `
      )
      .join("");
    refs.eventLog.scrollTop = refs.eventLog.scrollHeight;
  }

  function renderRulesModal() {
    refs.rulesModal.classList.toggle("hidden", !state.rulesOpen);
    refs.rulesModal.setAttribute("aria-hidden", String(!state.rulesOpen));
  }

  function renderPlunderModal() {
    const choice = state.pendingPlunderChoice;
    refs.plunderModal.classList.toggle("hidden", !choice);
    refs.plunderModal.setAttribute("aria-hidden", String(!choice));

    if (!choice) {
      return;
    }

    refs.plunderDescription.textContent = `${choice.winnerAnalysis.name} won with a 7 and may capture one losing attack card.`;
    refs.plunderOptions.innerHTML = choice.options
      .map(
        (option) => `
          <button
            type="button"
            class="ghost-button ${state.selectedPlunderCardId === option.card.id ? "selected" : ""}"
            data-plunder-card-id="${escapeHtml(option.card.id)}"
          >
            ${escapeHtml(option.playerName)} • ${escapeHtml(formatCard(option.card))}
          </button>
        `
      )
      .join("");
    refs.plunderConfirm.disabled = !state.selectedPlunderCardId;
  }

  function renderEndgameModal() {
    const score = state.finalScore;
    const visible = state.gameOver && Boolean(score);
    refs.endgameModal.classList.toggle("hidden", !visible);
    refs.endgameModal.setAttribute("aria-hidden", String(!visible));

    if (!visible) {
      return;
    }

    const winners = score.winners.map((winner) => winner.name);
    refs.endgameTitle.textContent =
      winners.length === 1 ? `${winners[0]} wins` : `${winners.join(" and ")} share the win`;
    refs.endgameCopy.textContent =
      score.reasonText ||
      "The deck could not keep the prize pair alive, so total owned cards decide the result.";

    refs.endgameScoreboard.innerHTML = score.rows
      .map(
        (row) => `
          <div class="score-row">
            <div>
              <strong>${escapeHtml(row.name)}</strong>
              <div class="score-line">Owned cards: ${escapeHtml(row.totalCount)}</div>
              <div class="score-line">Hand ${escapeHtml(row.handCount)} • Reserve ${escapeHtml(row.reserveCount)}</div>
            </div>
            <div class="score-line">
              Specials: ${escapeHtml(row.specialCount)}<br />
              Aces: ${escapeHtml(row.aceCount)}
            </div>
          </div>
        `
      )
      .join("");
  }

  function renderMiniCard(card) {
    return `
      <div class="mini-card ${card.color === "red" ? "red-card" : "black-card"}">
        ${cardInnerMarkup(card)}
      </div>
    `;
  }

  function renderFaceDownCard() {
    return `<div class="mini-card card-back">Greedy 8s</div>`;
  }

  function renderMotionCard(card, options = {}) {
    const faceDown = Boolean(options.faceDown);
    return faceDown
      ? `<div class="card-motion-card card-back">Greedy 8s</div>`
      : `<div class="card-motion-card ${card.color === "red" ? "red-card" : "black-card"}">${cardInnerMarkup(card)}</div>`;
  }

  function renderCardFace(card) {
    return `
      <div class="card-face ${card.color === "red" ? "red-card" : "black-card"}">
        ${cardInnerMarkup(card)}
      </div>
    `;
  }

  function cardInnerMarkup(card) {
    return `
      <div class="card-corners">
        <span>${escapeHtml(card.rank)}${escapeHtml(card.suitSymbol)}</span>
        <span>${escapeHtml(card.rank)}</span>
      </div>
      <div class="card-center">${escapeHtml(card.suitSymbol)}</div>
      <div class="card-footer">${escapeHtml(card.suitLabel)}</div>
    `;
  }

  function toggleRules(forceOpen) {
    state.rulesOpen = typeof forceOpen === "boolean" ? forceOpen : !state.rulesOpen;
    render();
  }

  function buildRulesMarkup() {
    return `
      <h3>Objective</h3>
      <p>Finish with the most owned cards, counting both hand and reserve, when the deck can no longer restore the two-card prize pair, unless three players run completely out of owned cards in the same round and end the game immediately.</p>
      <h3>Round flow</h3>
      <ul>
        <li>Two face-up prize cards sit in the center.</li>
        <li>Before locking in, each player may draw 1 hidden card from the main deck up to 2 times per game. Drawing does not consume the round action.</li>
        <li>If a player starts the round at 3 cards or fewer in hand, they may draw any number of ready reserve cards back into hand, up to the hand limit. Each reserve draw is random and does not consume the round action.</li>
        <li>Players may not voluntarily pass. If they have cards, they must attack or use the swap action, even with an illegal attack.</li>
        <li>A forced pass only happens when a player has no cards and no legal way to gain one before acting.</li>
        <li>Each player commits one hidden attack card and may reveal one support card from 2, 7, 8, J, Q, K, or A.</li>
        <li>Instead of attacking, a player may spend the round swapping one hidden hand card through the face-down Effects Deck if the deck has at least 2 cards. Each player may do this at most 3 times per game.</li>
        <li>Support cards are public before attacks flip.</li>
        <li>After reveal, legal attacks must match at least one prize by rank or suit.</li>
      </ul>
      <h3>Hand limit and reserve</h3>
      <ul>
        <li>The hand limit is 5 cards in 4-player games and 7 cards in 2- or 3-player games.</li>
        <li>If a player gains cards above that limit, their highest-ranking excess cards automatically move face down into reserve.</li>
        <li>Reserve cards stay face down, cannot be drawn in the very next round after being banked, and come back only through random reserve draws.</li>
      </ul>
      <h3>Winning priority</h3>
      <ul>
        <li>Highest legal attack rank wins the round.</li>
        <li>If attack ranks tie, suit-match beats rank-match. A card that matches both counts as suit-match for tie purposes.</li>
        <li>If still tied, use suit hierarchy: Hearts &gt; Diamonds &gt; Spades &gt; Clubs.</li>
        <li>Exact dead ties: Ace Suit Shift wins, wild 8 loses to natural/Ace ties, and 8-v-8 uses the support 8 suit.</li>
      </ul>
      <h3>Support effects</h3>
      <ul>
        <li><strong>8</strong>: Wild Match. Choose rank-match to copy the highest prize rank, or suit-match to copy the best prize suit; exact 8-v-8 dead ties use the suit of the supporting 8.</li>
        <li><strong>J</strong>: Power Lift. Your attack rank increases by 2 for legality and winner comparison, capped at Ace.</li>
        <li><strong>2</strong>: Targeted Sabotage. Pick one opponent. If you win and they lose, their attack is banished to the Jail Deck.</li>
        <li><strong>7</strong>: Plunder. If you win, capture one losing attack card.</li>
        <li><strong>Q</strong>: Lockdown. If you win the round, losing attack cards are banished to the Jail Deck.</li>
        <li><strong>K</strong>: King's Decree. If you win, every player with reserve banishes 1 random reserve card to the Jail Deck.</li>
        <li><strong>A</strong>: Suit Shift. Your attack uses the Ace's suit for matching and tie-breaks.</li>
      </ul>
      <h3>Cleanup</h3>
      <ul>
        <li>The winner takes both prize cards.</li>
        <li>The winner's attack card stays behind as one new prize card.</li>
        <li>A new prize card is drawn from the deck.</li>
        <li>Support cards always move face down to the Effects Deck.</li>
        <li>The Jail Deck is permanent. Cards banished there never return to hands, reserve, the Effects Deck, or the main deck.</li>
        <li>Players with no owned cards refill from the face-down Effects Deck after cleanup if it can share enough cards evenly.</li>
      </ul>
    `;
  }

  function renderGameToText() {
    const human = getHumanPlayer();
    const payload = {
      coordinateSystem: "DOM card table; no spatial coordinates.",
      screen: state.gameStarted ? "game" : "start",
      phase: state.phase,
      round: state.roundNumber,
      deckCount: state.deck.length,
      prizeCards: state.prizeCards.map((card) => card.label),
      winnerPlayerId: state.winnerPlayerId,
      human: human
        ? {
            name: human.name,
            handLimit: getHandLimit(),
            handCount: human.hand.length,
            totalOwned: getTotalOwnedCardCount(human),
            reserveCount: human.reserve.length,
            reserveReadyCount: getReadyReserveEntries(human).length,
            reserveCards: human.reserve.map((entry) => ({
              ready: entry.availableRound <= state.roundNumber,
              availableRound: entry.availableRound,
            })),
            drawsUsed: human.drawsUsed,
            drawsLeft: Math.max(0, 2 - human.drawsUsed),
            selectedAttack: human.selectedAttackCardId,
            selectedSupport: human.selectedSupportCardId,
            selectedWild8Mode: human.selectedWild8Mode,
            selectedSwap: human.selectedSwapCardId,
            selectedSupportTargetPlayerId: human.selectedSupportTargetPlayerId,
            swapsUsed: human.swapsUsed,
            lockedIn: human.lockedIn,
          }
        : null,
      players: state.players.map((player) => {
        const play = state.roundPlays[player.id] || {};
        return {
          id: player.id,
          name: player.name,
          type: player.type,
          handLimit: getHandLimit(),
          handCount: player.hand.length,
          totalOwned: getTotalOwnedCardCount(player),
          reserveCount: player.reserve.length,
          reserveReadyCount: getReadyReserveEntries(player).length,
          drawsUsed: player.drawsUsed,
          drawsLeft: Math.max(0, 2 - player.drawsUsed),
          swapsUsed: player.swapsUsed,
          lockedIn: player.lockedIn,
          wonLastRound: player.wonLastRound,
          actionType: play.actionType || null,
          support: play.supportCard ? play.supportCard.label : null,
          wild8Mode: play.wild8Mode || null,
          supportTargetPlayerId: play.supportTargetPlayerId || null,
          swap: play.actionType === "swap" ? "hidden" : null,
          attack: play.revealed && play.attackCard ? play.attackCard.label : play.attackCard ? "hidden" : null,
          legal: play.legal,
          matchType: play.matchType,
          effectiveRankValue: play.effectiveRankValue ?? null,
          effectiveRankLabel: play.effectiveRankLabel ?? null,
          effectiveSuit: play.effectiveSuit,
          usedJackBoost: play.usedJackBoost || false,
        };
      }),
      pendingPlunder: state.pendingPlunderChoice
        ? state.pendingPlunderChoice.options.map((option) => ({
            playerName: option.playerName,
            card: option.card.label,
          }))
        : null,
      focusedHandIndex: state.focusedHandIndex,
      effectsDeckCount: state.effectPile.length,
      effectPileCount: state.effectPile.length,
      jailDeckCount: state.jailDeck.length,
      eventLogCount: state.eventLog.length,
      gameOver: state.gameOver,
    };

    return JSON.stringify(payload);
  }
})();
