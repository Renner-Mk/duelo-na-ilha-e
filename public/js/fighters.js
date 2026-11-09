// Personagens em SVG: raposa de capacete (azul/h1), gato de faixa na cabeça (vermelho/h2) e os inimigos do coop:
// Brutamontes (verde), Fisgador (roxo), Investidor (laranja) e o Chefão (escuro, coroado).
// Cada parte tem uma classe (f-*) para as animações de CSS: respirar, piscar, cauda, orelhas, braços.

const COMMON_HEAD_EXPR = `
  <g class="f-brows"><path class="inkS" d="M33 36 L45 40"/><path class="inkS" d="M67 36 L55 40"/></g>
  <path class="f-sweat" d="M73 32 Q78 39 73 44 Q68 39 73 32Z"/>`;

const FOX = `
<svg class="fighter fox" viewBox="0 0 100 100" aria-hidden="true">
  <ellipse class="f-shadow" cx="50" cy="92" rx="25" ry="6"/>
  <g class="f-all">
    <g class="f-tail">
      <path class="fur" d="M62 82 C94 90 104 52 86 34 C84 54 74 64 60 68Z"/>
      <path class="white" d="M86 34 C95 42 98 56 93 66 C86 54 82 46 86 34Z"/>
    </g>
    <g class="f-feet"><ellipse class="fur2" cx="39" cy="88" rx="9.5" ry="5.5"/><ellipse class="fur2" cx="61" cy="88" rx="9.5" ry="5.5"/></g>
    <g class="f-body">
      <ellipse class="fur" cx="50" cy="69" rx="21" ry="19"/>
      <ellipse class="belly" cx="50" cy="73" rx="12.5" ry="12.5"/>
      <g class="f-armL"><rect class="fur" x="24.5" y="58" width="9.5" height="18" rx="4.7"/><circle class="acc" cx="29.3" cy="78" r="6.6"/><rect class="white" x="25.5" y="71" width="7.6" height="3.2" rx="1.6"/></g>
      <g class="f-armR"><rect class="fur" x="66" y="58" width="9.5" height="18" rx="4.7"/><circle class="acc" cx="70.7" cy="78" r="6.6"/><rect class="white" x="66.9" y="71" width="7.6" height="3.2" rx="1.6"/></g>
      <g class="f-head">
        <path class="f-earL fur" d="M27 40 L28 8 L48 24Z"/><path class="f-earL ear" d="M31 31 L31.5 15 L42 24.5Z"/>
        <path class="f-earR fur" d="M73 40 L72 8 L52 24Z"/><path class="f-earR ear" d="M69 31 L68.5 15 L58 24.5Z"/>
        <path class="fur" d="M26 46 C26 28 38 22 50 22 C62 22 74 28 74 46 C74 60 62 66 50 66 C38 66 26 60 26 46Z"/>
        <path class="fur" d="M26 47 L17 54 L30 56Z"/><path class="fur" d="M74 47 L83 54 L70 56Z"/>
        <path class="belly" d="M37 52 C41 47 59 47 63 52 C61 63 39 63 37 52Z"/>
        <ellipse class="ink" cx="50" cy="51" rx="3.4" ry="2.5"/>
        <path class="inkS f-mouth" d="M45 57 Q50 61 55 57"/>
        <g class="f-eyes">
          <ellipse class="white" cx="40" cy="44" rx="5.6" ry="6.6"/><ellipse class="white" cx="60" cy="44" rx="5.6" ry="6.6"/>
          <circle class="ink f-pupil" cx="40.6" cy="45" r="3.3"/><circle class="ink f-pupil" cx="59.4" cy="45" r="3.3"/>
          <circle class="white" cx="41.8" cy="43.4" r="1.2"/><circle class="white" cx="60.6" cy="43.4" r="1.2"/>
        </g>
        <g class="f-hurt"><path class="inkS" d="M35 40 L45 48 M45 40 L35 48 M55 40 L65 48 M65 40 L55 48"/></g>
        ${COMMON_HEAD_EXPR.replace(/M33 36 L45 40/, 'M33 38 L45 42').replace(/M67 36 L55 40/, 'M67 38 L55 42')}
        <path class="steel" d="M32 35 C32 15 68 15 68 35Z"/>
        <rect class="steel2" x="30" y="33" width="40" height="5.5" rx="2.7"/>
        <path class="acc" d="M50 13 L45.5 23 L54.5 23Z"/>
        <path class="shine" d="M38 26 C40 20 46 18 50 18"/>
      </g>
    </g>
  </g>
</svg>`;

const CAT = `
<svg class="fighter cat" viewBox="0 0 100 100" aria-hidden="true">
  <ellipse class="f-shadow" cx="50" cy="92" rx="25" ry="6"/>
  <g class="f-all">
    <g class="f-tail">
      <path class="furS" d="M64 82 C92 86 98 58 82 46"/>
      <path class="fur2S" d="M64 82 C92 86 98 58 82 46" stroke-dasharray="3 7"/>
    </g>
    <g class="f-feet"><ellipse class="fur2" cx="39" cy="88" rx="9.5" ry="5.5"/><ellipse class="fur2" cx="61" cy="88" rx="9.5" ry="5.5"/></g>
    <g class="f-body">
      <ellipse class="fur" cx="50" cy="69" rx="20" ry="19"/>
      <ellipse class="belly" cx="50" cy="73" rx="11.5" ry="12.5"/>
      <g class="f-armL"><rect class="fur" x="25" y="58" width="9.5" height="18" rx="4.7"/><circle class="acc" cx="29.8" cy="78" r="6.6"/><rect class="red" x="26" y="71" width="7.6" height="3.2" rx="1.6"/></g>
      <g class="f-armR"><rect class="fur" x="65.5" y="58" width="9.5" height="18" rx="4.7"/><circle class="acc" cx="70.3" cy="78" r="6.6"/><rect class="red" x="66.4" y="71" width="7.6" height="3.2" rx="1.6"/></g>
      <g class="f-head">
        <path class="f-earL fur" d="M28 38 L26 7 L47 22Z"/><path class="f-earL ear" d="M31.5 30 L30.5 15 L41 23.5Z"/>
        <path class="f-earR fur" d="M72 38 L74 7 L53 22Z"/><path class="f-earR ear" d="M68.5 30 L69.5 15 L59 23.5Z"/>
        <circle class="fur" cx="50" cy="44" r="23"/>
        <ellipse class="belly" cx="50" cy="55" rx="10.5" ry="7.5"/>
        <path class="pinkN" d="M46.6 50.5 L53.4 50.5 L50 54.5Z"/>
        <path class="inkS f-mouth" d="M50 54.5 Q46.5 59 43 56.5 M50 54.5 Q53.5 59 57 56.5"/>
        <path class="whisk" d="M38 53 L24 50 M38 56 L24 58 M62 53 L76 50 M62 56 L76 58"/>
        <g class="f-eyes">
          <ellipse class="white" cx="40" cy="46" rx="5.4" ry="6.4"/><ellipse class="white" cx="60" cy="46" rx="5.4" ry="6.4"/>
          <circle class="ink f-pupil" cx="40.6" cy="47" r="3.2"/><circle class="ink f-pupil" cx="59.4" cy="47" r="3.2"/>
          <circle class="white" cx="41.8" cy="45.4" r="1.2"/><circle class="white" cx="60.6" cy="45.4" r="1.2"/>
        </g>
        <path class="scar" d="M63.5 36 L56.5 56 M59 41 L64 43 M57.4 48 L62.5 50"/>
        <g class="f-hurt"><path class="inkS" d="M35 42 L45 50 M45 42 L35 50 M55 42 L65 50 M65 42 L55 50"/></g>
        ${COMMON_HEAD_EXPR.replace(/M33 36 L45 40/, 'M33 39 L45 43').replace(/M67 36 L55 40/, 'M67 39 L55 43')}
        <g class="f-band">
          <path class="white" d="M27 34 Q50 26 73 34 L73 40 Q50 32 27 40Z"/>
          <path class="red" d="M27 38 Q50 30 73 38 L73 40 Q50 32 27 40Z" opacity=".9"/>
          <path class="white" d="M27 36 L13 30 L17 38 L12 44 L27 40Z"/>
        </g>
      </g>
    </g>
  </g>
</svg>`;

// Olhos e boca em comum dos inimigos (as classes f-* alimentam as animações de piscar, dano e medo).
const EYES = (y, dx = 10, r = 5.3) => `
        <g class="f-eyes">
          <ellipse class="white" cx="${50 - dx}" cy="${y}" rx="${r}" ry="${r + 0.5}"/><ellipse class="white" cx="${50 + dx}" cy="${y}" rx="${r}" ry="${r + 0.5}"/>
          <circle class="ink f-pupil" cx="${50 - dx + 0.6}" cy="${y + 1}" r="${r * 0.58}"/><circle class="ink f-pupil" cx="${50 + dx - 0.6}" cy="${y + 1}" r="${r * 0.58}"/>
          <circle class="white" cx="${50 - dx + 1.8}" cy="${y - 0.6}" r="1.1"/><circle class="white" cx="${50 + dx + 0.6}" cy="${y - 0.6}" r="1.1"/>
        </g>
        <g class="f-hurt"><path class="inkS" d="M${50 - dx - 5} ${y - 5} L${50 - dx + 5} ${y + 5} M${50 - dx + 5} ${y - 5} L${50 - dx - 5} ${y + 5} M${50 + dx - 5} ${y - 5} L${50 + dx + 5} ${y + 5} M${50 + dx + 5} ${y - 5} L${50 + dx - 5} ${y + 5}"/></g>
        <g class="f-brows"><path class="inkS" d="M${50 - dx - 7} ${y - 8} L${50 - dx + 5} ${y - 4}"/><path class="inkS" d="M${50 + dx + 7} ${y - 8} L${50 + dx - 5} ${y - 4}"/></g>
        <path class="f-sweat" d="M74 28 Q79 35 74 40 Q69 35 74 28Z"/>`;

const BRUTE = (boss) => `
<svg class="fighter ${boss ? 'boss' : 'brute'}" viewBox="0 0 100 100" aria-hidden="true">
  <ellipse class="f-shadow" cx="50" cy="92" rx="27" ry="6"/>
  <g class="f-all">
    <g class="f-feet"><ellipse class="fur2" cx="35" cy="88" rx="11" ry="6"/><ellipse class="fur2" cx="65" cy="88" rx="11" ry="6"/></g>
    <g class="f-body">
      <ellipse class="fur" cx="50" cy="66" rx="27" ry="22"/>
      <ellipse class="belly" cx="50" cy="71" rx="16" ry="14"/>
      <g class="f-armL"><rect class="fur" x="17" y="52" width="14" height="24" rx="7"/><circle class="acc" cx="24" cy="78" r="9.5"/></g>
      <g class="f-armR"><rect class="fur" x="69" y="52" width="14" height="24" rx="7"/><circle class="acc" cx="76" cy="78" r="9.5"/></g>
      <g class="f-head">
        <path class="horn" d="M30 36 L19 12 L41 28Z"/><path class="horn" d="M70 36 L81 12 L59 28Z"/>
        <ellipse class="fur" cx="50" cy="42" rx="22" ry="19"/>
        <path class="white tusk" d="M39 53 L35 65 L46 56Z"/><path class="white tusk" d="M61 53 L65 65 L54 56Z"/>
        <path class="inkS f-mouth" d="M40 55 Q50 49 60 55"/>
        ${EYES(41, 10, 5.2)}
        <path class="inkS" d="M32 33 L46 38 M68 33 L54 38"/>
        ${boss ? '<path class="acc crown" d="M32 26 L35 12 L43 21 L50 8 L57 21 L65 12 L68 26Z"/>' : ''}
      </g>
    </g>
  </g>
</svg>`;

const HOOKER = `
<svg class="fighter hooker" viewBox="0 0 100 100" aria-hidden="true">
  <ellipse class="f-shadow" cx="50" cy="92" rx="25" ry="6"/>
  <g class="f-all">
    <g class="f-feet"><ellipse class="fur2" cx="39" cy="88" rx="10" ry="5.5"/><ellipse class="fur2" cx="61" cy="88" rx="10" ry="5.5"/></g>
    <g class="f-body">
      <ellipse class="fur" cx="50" cy="68" rx="21" ry="19"/>
      <ellipse class="belly" cx="50" cy="72" rx="13" ry="12.5"/>
      <g class="f-armL"><rect class="fur" x="23" y="58" width="10" height="18" rx="5"/><circle class="acc" cx="28" cy="78" r="6.8"/></g>
      <g class="f-armR">
        <path class="steelS ink2" d="M73 62 L90 30"/><path class="steelS" d="M73 62 L90 30"/>
        <path class="steelS ink2" d="M90 30 q9 -7 3 -15 q-4 -5 -10 -1"/><path class="steelS" d="M90 30 q9 -7 3 -15 q-4 -5 -10 -1"/>
        <rect class="fur" x="67" y="58" width="10" height="18" rx="5"/><circle class="acc" cx="72" cy="63" r="6.8"/>
      </g>
      <g class="f-head">
        <path class="fur2" d="M50 10 L38 32 L62 32Z"/>
        <circle class="fur" cx="50" cy="44" r="22"/>
        <path class="inkS f-mouth" d="M36 52 Q50 67 64 52"/>
        <path class="white tusk" d="M42 56 L44 62 L48 58Z"/><path class="white tusk" d="M58 56 L56 62 L52 58Z"/>
        ${EYES(38, 12, 6.6)}
      </g>
    </g>
  </g>
</svg>`;

const DASHER = `
<svg class="fighter dasher" viewBox="0 0 100 100" aria-hidden="true">
  <ellipse class="f-shadow" cx="50" cy="92" rx="25" ry="6"/>
  <g class="f-all">
    <path class="whisk speed" d="M2 56 H18 M0 68 H15 M4 80 H20"/>
    <g class="f-feet"><ellipse class="fur2" cx="39" cy="88" rx="10" ry="5.5"/><ellipse class="fur2" cx="61" cy="88" rx="10" ry="5.5"/></g>
    <g class="f-body">
      <ellipse class="fur" cx="50" cy="69" rx="21" ry="18"/>
      <ellipse class="belly" cx="50" cy="73" rx="12" ry="11.5"/>
      <g class="f-armL"><rect class="fur" x="24" y="58" width="9" height="17" rx="4.5"/><circle class="acc" cx="28.5" cy="77" r="6"/></g>
      <g class="f-armR"><rect class="fur" x="67" y="58" width="9" height="17" rx="4.5"/><circle class="acc" cx="71.5" cy="77" r="6"/></g>
      <g class="f-head">
        <circle class="fur" cx="29" cy="34" r="7.5"/><circle class="fur" cx="71" cy="34" r="7.5"/>
        <path class="horn" d="M50 4 L42 28 L58 28Z"/>
        <ellipse class="fur" cx="50" cy="45" rx="23" ry="19"/>
        <ellipse class="belly" cx="50" cy="54" rx="11" ry="7.5"/>
        <ellipse class="ink" cx="46" cy="54" rx="1.6" ry="2"/><ellipse class="ink" cx="54" cy="54" rx="1.6" ry="2"/>
        <path class="inkS f-mouth" d="M43 60 Q50 63 57 60"/>
        ${EYES(42, 10, 4.9)}
        <path class="inkS" d="M32 34 L46 40 M68 34 L54 40"/>
      </g>
    </g>
  </g>
</svg>`;

const SPRITES = {
  fox: FOX, cat: CAT, brute: BRUTE(false), boss: BRUTE(true), hooker: HOOKER, dasher: DASHER,
};
const ALIAS = { p1: 'fox', h1: 'fox', p2: 'cat', h2: 'cat' };

// Aceita um tipo ('fox', 'brute'...) ou um id de jogador ('p1', 'h2'...).
export function fighterSVG(kind) {
  return SPRITES[ALIAS[kind] || kind] || FOX;
}

// Luva de boxe usada no golpe que "voa" até o alvo.
export const GLOVE_SVG = `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <rect x="8" y="24" width="18" height="12" rx="3" fill="#fff" stroke="#2a2350" stroke-width="2.4"/>
  <path d="M7 18 C7 8 16 4 23 6 C31 8 34 15 31 22 C29 27 25 28 20 28 L12 28 C8 27 7 23 7 18Z" fill="#ff3d4d" stroke="#2a2350" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M12 14 C14 10 19 9 22 10" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".7"/>
  <ellipse cx="29.5" cy="16" rx="4.2" ry="5" fill="#ff6b78" stroke="#2a2350" stroke-width="2"/>
</svg>`;
