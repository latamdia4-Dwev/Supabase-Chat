// js/config.js
const SUPABASE_URL = "https://xftmgzrkqhuzoymvkoqp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmdG1nenJrcWh1em95bXZrb3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDU4NDcsImV4cCI6MjA5ODU4MTg0N30.CytrKW-eWdFwRxS5DHL432B1Fa5sklewtd_DpMLWs0Q";

// Inicialización única de la instancia global de Supabase.
// persistSession: false y autoRefreshToken: false hacen que la sesión NUNCA
// se guarde en el navegador (localStorage). Esto significa que al recargar
// la página, cerrar la pestaña o el navegador, la sesión desaparece y
// siempre habrá que volver a iniciar sesión con la contraseña.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

// Correo interno fijo para el login del chat (no es secreto, es solo un
// identificador). Debes crear UNA cuenta con este correo exacto en tu panel
// de Supabase (Authentication > Users), con la contraseña que tú quieras.
// Cuando más adelante quieras chats privados con varias personas, aquí se
// puede volver a agregar un campo de correo real en vez de este valor fijo.
const CHAT_LOGIN_EMAIL = "chat@tuapp.com";

// Referencias a los elementos del DOM (chat)
const chatContainer = document.getElementById('chatContainer');
const messagesContainer = document.getElementById('chatMessages');
const form = document.getElementById('chatForm');
const fileInput = document.getElementById('fileInput');
const msgInput = document.getElementById('msgInput');
const previewContainer = document.getElementById('previewContainer');
const sendBtn = document.getElementById('sendBtn');
const themeToggle = document.getElementById('themeToggle');
const adminToggle = document.getElementById('adminToggle');
const hideChatBtn = document.getElementById('hideChatBtn');
const dimToggleBtn = document.getElementById('dimToggleBtn');
const dimIntensitySlider = document.getElementById('dimIntensitySlider');
const loadMoreBar = document.getElementById('loadMoreBar');
const prevTrackBtn = document.getElementById('prevTrackBtn');
const nextTrackBtn = document.getElementById('nextTrackBtn');

// Referencias a los elementos del DOM (bloqueo por contraseña)
const lockOverlay = document.getElementById('lockOverlay');
const lockPasswordInput = document.getElementById('lockPasswordInput');
const lockSubmitBtn = document.getElementById('lockSubmitBtn');
const lockError = document.getElementById('lockError');

// Referencias a los elementos del DOM (radio / música)
const musicToggle = document.getElementById('musicToggle');
const musicPanel = document.getElementById('musicPanel');
const musicPlayerBar = document.getElementById('musicPlayerBar');
const musicInput = document.getElementById('musicInput');
const searchMusicBtn = document.getElementById('searchMusicBtn');
const radioResults = document.getElementById('radioResults');
const tabRadio = document.getElementById('tabRadio');
const tabSongs = document.getElementById('tabSongs');
const musicHint = document.getElementById('musicHint');
const currentTrackTitle = document.getElementById('currentTrackTitle');
const audioPlayer = document.getElementById('audioPlayer');
const playPauseBtn = document.getElementById('playPauseBtn');
const volumeSlider = document.getElementById('volumeSlider');
const muteBtn = document.getElementById('muteBtn');

// Referencias a los elementos del DOM (lightbox)
const lightboxModal = document.getElementById('lightboxModal');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');

// Variables de estado del Chat y Sesión
const mySessionId = Math.random().toString(36).substring(2, 9);
let queueFiles = [];
let isAdmin = false;

// Variables de estado para el Zoom de Imágenes
let zoomScale = 1;
let isDragging = false;
let startX, startY, translateX = 0, translateY = 0;
