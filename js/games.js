// js/games.js
// Panel de juegos embebidos. Cada juego trae su propia 'url' de embed ya
// armada, para poder mezclar fuentes distintas sin adivinar patrones:
// - playpager.com/embed/*  → catálogo diseñado para embeberse en cualquier
//   sitio de terceros, sin registro (https://playpager.com/embed-games/).
// - codepen.io/*/embed/*   → función oficial de CodePen para embeber pens
//   públicos (el autor lo habilita explícitamente al publicar el pen).
// A diferencia de portales como Miniplay (que solo permiten iframes desde
// dominios socios autorizados y redirigen a una página rota si tu dominio
// no está en su lista), estas dos fuentes SÍ están pensadas para esto.
// Agrega o quita juegos editando el array GAMES.

const GAMES = [
    // --- Multijugador (2 jugadores, mismo dispositivo) ---
    {
        name: 'Tic-Tac-Toe 2J',
        icon: '❌',
        tag: '2 jugadores · Multijugador',
        slug: 'tictactoe-2p',
        url: 'https://codepen.io/freeCodeCamp/embed/KzXQgy?default-tab=result&theme-id=dark'
    },
    {
        name: 'Conecta 4',
        icon: '🔴',
        tag: '2 jugadores · Multijugador',
        slug: 'connect-four',
        url: 'https://codepen.io/jslegers/embed/wyrBx?default-tab=result&theme-id=dark'
    },
    // --- Juegos de mesa (contra la máquina) ---
    {
        name: 'Ajedrez',
        icon: '♟️',
        tag: 'Mesa · Contra la máquina',
        slug: 'chess',
        url: 'https://playpager.com/embed/chess/index.html'
    },
    {
        name: 'Damas',
        icon: '⚫',
        tag: 'Mesa · Contra la máquina',
        slug: 'checkers',
        url: 'https://playpager.com/embed/checkers/index.html'
    },
    {
        name: 'Othello / Reversi',
        icon: '🔴',
        tag: 'Mesa · Contra la máquina',
        slug: 'reversi',
        url: 'https://playpager.com/embed/reversi/index.html'
    },
    // --- Puzzle ---
    {
        name: 'Sopa de letras',
        icon: '🔤',
        tag: 'Puzzle',
        slug: 'wordpuzzle',
        url: 'https://playpager.com/embed/wordpuzzle/index.html'
    },
    {
        name: 'Sudoku',
        icon: '🔢',
        tag: 'Puzzle',
        slug: 'sudoku',
        url: 'https://playpager.com/embed/sudoku/index.html'
    },
    // --- Arcade / Cartas ---
    {
        name: 'Falling Cubes',
        icon: '🧊',
        tag: 'Arcade',
        slug: 'cubes',
        url: 'https://playpager.com/embed/cubes/index.html'
    },
    {
        name: 'Solitario',
        icon: '🃏',
        tag: 'Cartas',
        slug: 'solitaire',
        url: 'https://playpager.com/embed/solitaire/index.html'
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
    gameFrame.src = game.url;
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
    // (Ya no carga un juego automáticamente: abre mostrando la lista)
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
