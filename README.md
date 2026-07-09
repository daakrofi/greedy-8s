# Greedy 8s

A browser card game of attacking, outmaneuvering, and plundering.

## Play locally

Serve this directory with any static web server, then open `index.html` through that server. For example:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## Controls

- Left-click a card to choose it as your attack.
- Right-click a special card to use it as support.
- Shift-click a card to stage an Effects Deck swap.
- Use **Draw 1** for one of your limited deck draws.
- Press **Play** when your move is valid.

The game logic lives in `app.js`. The reimagined presentation layer is isolated in `reimagined.css`.
