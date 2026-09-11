// Step 1-2: detect game end, then scrape the full move list in one pass.
//
// Deliberately does nothing while a game is in progress -- no board reading,
// no engine, no UI. See docs/DOM-NOTES.md for how these selectors were found.

(function () {
  const GAME_OVER_HEADER_SELECTOR = ".game-over-modal-header-component";
  const MOVE_LIST_SELECTOR = "wc-simple-move-list";

  let alreadyHandled = false;

  function scrapeSanMoves() {
    const rows = document.querySelectorAll(
      `${MOVE_LIST_SELECTOR} .main-line-row`
    );
    const sanMoves = [];

    for (const row of rows) {
      for (const moveClass of ["white-move", "black-move"]) {
        const node = row.querySelector(`.node.${moveClass}`);
        if (!node) continue;
        const span = node.querySelector(".node-highlight-content");
        if (span) sanMoves.push(span.textContent.trim());
      }
    }

    return sanMoves;
  }

  function getResultInfo() {
    const header = document.querySelector(GAME_OVER_HEADER_SELECTOR);
    if (!header) return null;

    // e.g. "game-over-modal-header-component game-over-modal-header-whiteWon"
    const resultClass = Array.from(header.classList).find(
      (c) => c.startsWith("game-over-modal-header-") && c !== "game-over-modal-header-component"
    );

    const title = header.querySelector(".game-over-modal-title-component");
    const subtitle = header.querySelector(".game-over-modal-subtitle-component");

    return {
      resultCode: resultClass ? resultClass.replace("game-over-modal-header-", "") : null,
      title: title ? title.textContent.trim() : null,
      subtitle: subtitle ? subtitle.textContent.trim() : null,
    };
  }

  function onGameOver() {
    if (alreadyHandled) return;
    alreadyHandled = true;

    const result = getResultInfo();
    const sanMoves = scrapeSanMoves();

    console.log("[chess-analyzer] Game over detected", result);
    console.log("[chess-analyzer] Scraped SAN moves:", sanMoves);

    // Next steps (not yet implemented):
    // 1. Feed sanMoves into chess.js to rebuild FEN per ply + export PGN.
    // 2. Inject an "Analyze Game" button into the page.
    // 3. On click, spin up Stockfish in a Web Worker and run MultiPV analysis.
    // 4. Render a chessground board + arrow-key navigation over the FEN list.
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector(GAME_OVER_HEADER_SELECTOR)) {
      observer.disconnect();
      onGameOver();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  console.log("[chess-analyzer] content script loaded, watching for game end");
})();
