// js/config.js
const SUPABASE_URL = "https://xftmgzrkqhuzoymvkoqp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmdG1nenJrcWh1em95bXZrb3FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDU4NDcsImV4cCI6MjA5ODU4MTg0N30.CytrKW-eWdFwRxS5DHL432B1Fa5sklewtd_DpMLWs0Q";

// Inicialización única de la instancia global de Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

// Referencias a los elementos del DOM (radio / música)
const musicToggle = document.getElementById('musicToggle');
const musicPanel = document.getElementById('musicPanel');
const musicInput = document.getElementById('musicInput');
const searchMusicBtn = document.getElementById('searchMusicBtn');
const radioResults = document.getElementById('radioResults');
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
