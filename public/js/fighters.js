// Personagens em SVG: Azul = raposa de capacete, Vermelho = gato de faixa na cabeça.
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

export function fighterSVG(pid) {
  return pid === 'p1' ? FOX : CAT;
}

// Luva de boxe usada no golpe que "voa" até o alvo.
export const GLOVE_SVG = `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <rect x="8" y="24" width="18" height="12" rx="3" fill="#fff" stroke="#2a2350" stroke-width="2.4"/>
  <path d="M7 18 C7 8 16 4 23 6 C31 8 34 15 31 22 C29 27 25 28 20 28 L12 28 C8 27 7 23 7 18Z" fill="#ff3d4d" stroke="#2a2350" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M12 14 C14 10 19 9 22 10" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".7"/>
  <ellipse cx="29.5" cy="16" rx="4.2" ry="5" fill="#ff6b78" stroke="#2a2350" stroke-width="2"/>
</svg>`;
