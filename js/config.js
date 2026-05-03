'use strict';
// ── Supabase ──────────────────────────────────────────────────
var SUPABASE_URL  = 'https://uazurfbmrnsadkrxutpo.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhenVyZmJtcm5zYWRrcnh1dHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NTY0NzEsImV4cCI6MjA2NzIzMjQ3MX0.GmBk4XRX0gVhw20gTGX8jM58mb2gXOFC7qkY8iMEU9k';
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── URL de la app de clases ───────────────────────────────────
// Cambia esta URL por la de tu plataforma de clases
var CLASE_APP_URL = 'https://santocuradearsrd-create.github.io/clases/';

// ── Constantes ────────────────────────────────────────────────
var SECCIONES = ['A','B','C','D','E'];

// ── Configuración de grados ───────────────────────────────────
var GRADOS_CONFIG = [
  {
    nivel:'1ro', nombre:'Primer Grado', etapa:'La semilla',
    g1:'#6D4C41', g2:'#3E2723', disponible:false,
    svg:`<svg viewBox="0 0 90 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="45" cy="68" rx="35" ry="8" fill="rgba(0,0,0,.2)"/>
      <rect x="10" y="60" width="70" height="14" rx="7" fill="#4E342E" opacity=".6"/>
      <ellipse cx="45" cy="52" rx="16" ry="11" fill="#D7CCC8" transform="rotate(-15,45,52)"/>
      <ellipse cx="45" cy="52" rx="10" ry="7" fill="#BCAAA4" transform="rotate(-15,45,52)"/>
      <path d="M45 62 Q42 72 36 74" stroke="#8D6E63" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M45 62 Q48 72 54 74" stroke="#8D6E63" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="22" cy="58" rx="7" ry="5" fill="#D7CCC8" opacity=".7" transform="rotate(-20,22,58)"/>
      <ellipse cx="40" cy="48" rx="5" ry="3" fill="rgba(255,255,255,.25)" transform="rotate(-15,40,48)"/>
    </svg>`
  },
  {
    nivel:'2do', nombre:'Segundo Grado', etapa:'Los primeros brotes',
    g1:'#66BB6A', g2:'#1B5E20', disponible:true,
    svg:`<svg viewBox="0 0 90 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="45" cy="72" rx="30" ry="6" fill="rgba(0,0,0,.2)"/>
      <rect x="15" y="66" width="60" height="10" rx="5" fill="#4E342E" opacity=".5"/>
      <path d="M45 66 Q44 50 45 30" stroke="#A5D6A7" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M45 50 Q28 42 22 30 Q36 30 45 44 Z" fill="#81C784"/>
      <path d="M45 42 Q62 34 68 22 Q54 24 45 38 Z" fill="#A5D6A7"/>
      <path d="M45 30 Q42 20 45 12 Q48 20 45 30 Z" fill="#C8E6C9"/>
      <circle cx="28" cy="36" r="2.5" fill="rgba(255,255,255,.6)"/>
    </svg>`
  },
  {
    nivel:'3ro', nombre:'Tercer Grado', etapa:'Creciendo hacia el sol',
    g1:'#26A69A', g2:'#004D40', disponible:false,
    svg:`<svg viewBox="0 0 90 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="45" cy="74" rx="28" ry="5" fill="rgba(0,0,0,.2)"/>
      <rect x="17" y="69" width="56" height="9" rx="4" fill="#4E342E" opacity=".5"/>
      <path d="M45 69 Q43 52 45 20" stroke="#80CBC4" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M45 60 Q26 55 18 44 Q32 44 45 56 Z" fill="#4DB6AC"/>
      <path d="M45 60 Q64 55 72 44 Q58 44 45 56 Z" fill="#80CBC4"/>
      <path d="M45 44 Q28 36 22 24 Q36 26 45 40 Z" fill="#26A69A"/>
      <path d="M45 44 Q62 36 68 24 Q54 26 45 40 Z" fill="#4DB6AC"/>
      <circle cx="72" cy="14" r="8" fill="rgba(255,235,59,.4)"/>
    </svg>`
  },
  {
    nivel:'4to', nombre:'Cuarto Grado', etapa:'El árbol joven',
    g1:'#42A5F5', g2:'#0D47A1', disponible:true,
    svg:`<svg viewBox="0 0 90 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="70" cy="14" rx="14" ry="7" fill="rgba(255,255,255,.25)"/>
      <ellipse cx="45" cy="75" rx="30" ry="5" fill="rgba(0,0,0,.2)"/>
      <rect x="15" y="70" width="60" height="8" rx="4" fill="#5D4037" opacity=".5"/>
      <path d="M40 70 Q39 55 40 40" stroke="#8D6E63" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M50 70 Q51 55 50 40" stroke="#795548" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="45" cy="46" rx="26" ry="14" fill="#388E3C" opacity=".8"/>
      <ellipse cx="45" cy="36" rx="22" ry="13" fill="#43A047"/>
      <ellipse cx="45" cy="25" rx="16" ry="11" fill="#66BB6A"/>
      <circle cx="45" cy="20" r="3" fill="#E8F5E9" opacity=".8"/>
    </svg>`
  },
  {
    nivel:'5to', nombre:'Quinto Grado', etapa:'El árbol maduro',
    g1:'#8BC34A', g2:'#33691E', disponible:true,
    svg:`<svg viewBox="0 0 90 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="45" cy="76" rx="32" ry="5" fill="rgba(0,0,0,.2)"/>
      <rect x="13" y="71" width="64" height="8" rx="4" fill="#4E342E" opacity=".6"/>
      <path d="M40 71 Q34 74 28 73" stroke="#6D4C41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M50 71 Q56 74 62 73" stroke="#6D4C41" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M38 71 Q36 52 38 35" stroke="#795548" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M52 71 Q54 52 52 35" stroke="#6D4C41" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M44 42 Q30 36 22 28" stroke="#795548" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M46 38 Q60 32 68 24" stroke="#795548" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="45" cy="48" rx="30" ry="14" fill="#2E7D32" opacity=".7"/>
      <ellipse cx="30" cy="36" rx="16" ry="12" fill="#388E3C"/>
      <ellipse cx="60" cy="32" rx="16" ry="12" fill="#43A047"/>
      <ellipse cx="45" cy="26" rx="20" ry="13" fill="#558B2F"/>
      <ellipse cx="45" cy="18" rx="14" ry="9" fill="#7CB342"/>
    </svg>`
  },
  {
    nivel:'6to', nombre:'Sexto Grado', etapa:'Los frutos del año',
    g1:'#FF8F00', g2:'#BF360C', disponible:true,
    svg:`<svg viewBox="0 0 90 80" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="45" cy="77" rx="32" ry="5" fill="rgba(0,0,0,.2)"/>
      <rect x="13" y="72" width="64" height="8" rx="4" fill="#4E342E" opacity=".6"/>
      <path d="M40 72 Q33 76 26 74" stroke="#5D4037" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M50 72 Q57 76 64 74" stroke="#5D4037" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M38 72 Q36 54 39 38" stroke="#6D4C41" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M52 72 Q54 54 51 38" stroke="#5D4037" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M44 44 Q28 38 20 28" stroke="#6D4C41" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M46 40 Q62 34 70 24" stroke="#6D4C41" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="45" cy="50" rx="28" ry="12" fill="#33691E" opacity=".8"/>
      <ellipse cx="28" cy="36" rx="16" ry="12" fill="#388E3C"/>
      <ellipse cx="62" cy="32" rx="16" ry="12" fill="#43A047"/>
      <ellipse cx="45" cy="25" rx="20" ry="13" fill="#558B2F"/>
      <circle cx="24" cy="38" r="5.5" fill="#E53935"/>
      <circle cx="24" cy="38" r="3.5" fill="#EF5350"/>
      <circle cx="66" cy="30" r="5" fill="#F57C00"/>
      <circle cx="66" cy="30" r="3" fill="#FF9800"/>
      <circle cx="45" cy="18" r="4.5" fill="#F9A825"/>
    </svg>`
  }
];
