// js/games.js
// Panel de juegos embebidos vía miniplay.com/embed/* (permite iframe).
// Agrega o quita juegos editando el array GAMES — solo necesitas el slug
// de miniplay (parte final de la URL del embed).

const GAMES = [
    {
        name: 'Ragdoll Archers',
        icon: '🏹',
        tag: 'Acción · 1-2J',
        slug: 'ragdoll-archers'
    },
    {
        name: 'Bloxd.io',
        icon: '🟫',
        tag: 'Multijugador',
        slug: 'bloxd-io'
    },
    {
        name: 'Melon Sandbox',
        icon: '🍉',
        tag: 'Sandbox',
        slug: 'melon-sandbox'
    },
    {
        name: '2-3-4 Player Games',
        icon: '🎲',
        tag: 'Multijugador',
        slug: '2-3-4-player-games'
    },
    {
        name: 'Plants vs Zombies',
        icon: '🌻',
        tag: 'Estrategia',
        slug: 'plants-vs-zombies'
    },
    {
        name: 'Stick Archers Battle',
        icon: '🪃',
        tag: 'Acción · 2J',
        slug: 'stick-archers-battle'
    },
];

const gameToggle   = document.getElementById('gameToggle');
const gamePanel    = document.getElementById('gamePanel');
const gamePanelClose = document.getElementById('gamePanelClose');
const gamePanelTitle = document.getElementById('gamePanelTitle');
const gameList     = document.getElementById('gameList');
const gameFrameWrap = document.getElementById('gameFrameWrap');
const gameFrame    = document.getElementById('gameFrame');

let activeGameSlug = null;

function buildGameList() {
    if (!gameList) return;
    gameList.innerHTML = '';
    GAMES.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card' + (game.slug === activeGameSlug ? ' active' : '');
        card.dataset.slug = game.slug;

        const icon = document.createElement('span');
        icon.className = 'game-card-icon';
        icon.textContent = game.icon;

        const name = document.createElement('span');
        name.className = 'game-card-name';
        name.textContent = game.name;

        const tag = document.createElement('span');
        tag.className = 'game-card-tag';
        tag.textContent = game.tag;

        card.appendChild(icon);
        card.appendChild(name);
        card.appendChild(tag);

        card.addEventListener('click', () => loadGame(game));
        gameList.appendChild(card);
    });
}

function loadGame(game) {
    if (!gameFrame || !gameFrameWrap) return;
    activeGameSlug = game.slug;

    // Update active card highlight
    document.querySelectorAll('.game-card').forEach(c => {
        c.classList.toggle('active', c.dataset.slug === game.slug);
    });

    // Show game title in header
    if (gamePanelTitle) gamePanelTitle.textContent = `${game.icon} ${game.name}`;

    // Collapse the grid to leave more room for the iframe
    if (gameList) gameList.style.display = 'none';

    // Load iframe
    gameFrame.src = `https://www.miniplay.com/embed/${game.slug}`;
    gameFrameWrap.style.display = 'block';

    // Add a "← Juegos" back button if not already there
    if (!document.getElementById('gameBackBtn')) {
        const backBtn = document.createElement('button');
        backBtn.id = 'gameBackBtn';
        backBtn.textContent = '← Juegos';
        backBtn.title = 'Volver a la lista';
        backBtn.style.cssText = `
            background:none;border:none;color:#3ecf8e;font-size:0.85em;
            cursor:pointer;padding:0;font-weight:bold;
        `;
        backBtn.addEventListener('click', showGameList);
        const header = document.querySelector('.game-panel-header');
        if (header) header.insertBefore(backBtn, header.firstChild);
    }
}

function showGameList() {
    activeGameSlug = null;
    if (gameFrame) gameFrame.src = '';
    if (gameFrameWrap) gameFrameWrap.style.display = 'none';
    if (gameList) gameList.style.display = 'grid';
    if (gamePanelTitle) gamePanelTitle.textContent = '🎮 Juegos';
    buildGameList();

    const backBtn = document.getElementById('gameBackBtn');
    if (backBtn) backBtn.remove();
}

function openGamePanel() {
    if (!gamePanel) return;
    gamePanel.style.display = 'flex';
    buildGameList();
    // Auto-load Ragdoll Archers on first open
    if (!activeGameSlug) loadGame(GAMES[0]);
}

function closeGamePanel() {
    if (!gamePanel) return;
    gamePanel.style.display = 'none';
    if (gameFrame) gameFrame.src = ''; // stop audio/network
    activeGameSlug = null;
}

if (gameToggle) {
    gameToggle.addEventListener('click', () => {
        if (gamePanel && gamePanel.style.display !== 'none') {
            closeGamePanel();
        } else {
            openGamePanel();
        }
    });
}

if (gamePanelClose) gamePanelClose.addEventListener('click', closeGamePanel);
