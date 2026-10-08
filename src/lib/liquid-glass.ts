// Mesin liquid glass reusable (refraksi + specular via filter SVG).
// Diekstrak persis dari demo /lab-glass2 (demo.css/demo.js satu file),
// dijadikan framework-agnostic agar bisa dipakai komponen produksi
// seperti LiquidGlassTabs tanpa menduplikasi logika.

export interface LiquidGlassConfig {
  glassThickness: number;
  bezelWidth: number;
  ior: number;
  scaleRatio: number;
  blur: number;
  specularOpacity: number;
  specularSat: number;
  tintColor: string;
  tintOpacity: number;
  innerShadow: string;
  innerShadowBlur: number;
  innerShadowSpread: number;
  balancedSpecular: boolean;
}

export const DEFAULT_LIQUID_GLASS_CONFIG: LiquidGlassConfig = {
  glassThickness: 80,
  bezelWidth: 40,
  ior: 1.4,
  scaleRatio: 1.0,
  blur: 1,
  specularOpacity: 0.6,
  specularSat: 0,
  tintColor: "255,255,255",
  tintOpacity: 0,
  innerShadow: "rgba(255,255,255,0)",
  innerShadowBlur: 0,
  innerShadowSpread: 0,
  balancedSpecular: false,
};

export const DEFAULT_LIQUID_GLASS_SWITCHER_CONFIG: LiquidGlassConfig = {
  glassThickness: 30,
  bezelWidth: 40,
  ior: 1.4,
  scaleRatio: 1.0,
  blur: 0,
  specularOpacity: 0.5,
  specularSat: 0,
  tintColor: "255,255,255",
  tintOpacity: 0,
  innerShadow: "rgba(255,255,255,0)",
  innerShadowBlur: 0,
  innerShadowSpread: 0,
  balancedSpecular: true,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function surfaceFn(x: number) {
  return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
}

function calcRefractionProfile(
  glassThickness: number,
  bezelWidth: number,
  ior: number,
  samples = 128
) {
  const eta = 1 / ior;
  function refract(nx: number, ny: number): [number, number] | null {
    const dot = ny;
    const k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    const sq = Math.sqrt(k);
    return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
  }
  const p = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = i / samples;
    const y = surfaceFn(x);
    const dx = x < 1 ? 0.0001 : -0.0001;
    const y2 = surfaceFn(x + dx);
    const deriv = (y2 - y) / dx;
    const mag = Math.sqrt(deriv * deriv + 1);
    const ref = refract(-deriv / mag, -1 / mag);
    p[i] = ref ? (ref[0] * ((y * bezelWidth + glassThickness) / ref[1])) : 0;
  }
  return p;
}

function generateDisplacementMap(
  w: number,
  h: number,
  radius: number,
  bezelWidth: number,
  profile: Float64Array,
  maxDisp: number
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 128;
    d[i + 1] = 128;
    d[i + 2] = 0;
    d[i + 3] = 255;
  }
  const r = radius;
  const rSq = r * r;
  const r1Sq = (r + 1) ** 2;
  const rBSq = Math.max(r - bezelWidth, 0) ** 2;
  const wB = w - r * 2;
  const hB = h - r * 2;
  const S = profile.length;
  for (let y1 = 0; y1 < h; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
      const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
      const dSq = x * x + y * y;
      if (dSq > r1Sq || dSq < rBSq) continue;
      const dist = Math.sqrt(dSq);
      const fromSide = r - dist;
      const op =
        dSq < rSq
          ? 1
          : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;
      const cos = x / dist;
      const sin = y / dist;
      const bi = Math.min(((fromSide / bezelWidth) * S) | 0, S - 1);
      const disp = profile[bi] || 0;
      const dX = (-cos * disp) / maxDisp;
      const dY = (-sin * disp) / maxDisp;
      const idx = (y1 * w + x1) * 4;
      // Dither ±1 LSB: memecah banding 8-bit agar lengkungan mulus.
      const j1 = Math.random() * 2 - 1;
      const j2 = Math.random() * 2 - 1;
      d[idx] = (128 + dX * 127 * op + j1 + 0.5) | 0;
      d[idx + 1] = (128 + dY * 127 * op + j2 + 0.5) | 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function generateSpecularMap(
  w: number,
  h: number,
  radius: number,
  bezelWidth: number,
  balanced: boolean
) {
  const angle = Math.PI / 3;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  d.fill(0);
  const r = radius;
  const rSq = r * r;
  const r1Sq = (r + 1) ** 2;
  const rBSq = Math.max(r - bezelWidth, 0) ** 2;
  const wB = w - r * 2;
  const hB = h - r * 2;
  const sv = [Math.cos(angle), Math.sin(angle)];
  for (let y1 = 0; y1 < h; y1++) {
    for (let x1 = 0; x1 < w; x1++) {
      const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
      const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
      const dSq = x * x + y * y;
      if (dSq > r1Sq || dSq < rBSq) continue;
      const dist = Math.sqrt(dSq);
      const fromSide = r - dist;
      const op =
        dSq < rSq
          ? 1
          : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;
      const cos = x / dist;
      const sin = -y / dist;
      const dot = balanced ? 1 : Math.abs(cos * sv[0] + sin * sv[1]);
      const edge = Math.sqrt(Math.max(0, 1 - (1 - fromSide) ** 2));
      const coeff = dot * edge;
      const col = (255 * coeff) | 0;
      const alpha = (col * coeff * op + (Math.random() * 2 - 1)) | 0;
      const idx = (y1 * w + x1) * 4;
      d[idx] = col;
      d[idx + 1] = col;
      d[idx + 2] = col;
      d[idx + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function svgEl(tag: string, attrs: Record<string, string | number>) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

let sharedDefs: SVGGElement | null = null;

function ensureGlassDefs(): SVGGElement | null {
  if (sharedDefs && document.documentElement.contains(sharedDefs)) {
    return sharedDefs;
  }
  const old = document.getElementById("lg-shared-defs");
  if (old && document.documentElement.contains(old)) {
    sharedDefs = old as unknown as SVGGElement;
    return sharedDefs;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:-1;";
  const inner = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "defs"
  );
  inner.id = "lg-shared-defs";
  svg.appendChild(inner);
  document.documentElement.appendChild(svg);
  sharedDefs = inner as unknown as SVGGElement;
  return sharedDefs;
}

// Referensi ke anak-anak filter yang berubah mengikuti ukuran pill.
// Dipakai untuk update in-place: ID filter tetap → tidak ada render ulang
// backdrop-filter yang bikin flicker saat lebar dianimasikan per frame.
interface GlassFilterNodes {
  filter: SVGElement;
  blur: SVGElement;
  dispImg: SVGElement;
  dispMap: SVGElement;
  spec: SVGElement;
  funcA: SVGElement;
}

// Bikin kerangka filter + isi geometri untuk ukuran awal. Node dibuat sekali;
// perubahan ukuran berikutnya lewat updateFilter (tanpa buat node baru).
function buildFilter(
  id: string,
  w: number,
  h: number,
  radius: number,
  cfg: LiquidGlassConfig
): GlassFilterNodes {
  const filter = svgEl("filter", {
    id,
    filterUnits: "userSpaceOnUse",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  });
  const blur = svgEl("feGaussianBlur", {
    in: "SourceGraphic",
    stdDeviation: cfg.blur,
    result: "blurred",
  });
  const dispImg = svgEl("feImage", { x: 0, y: 0, result: "disp_map" });
  const dispMap = svgEl("feDisplacementMap", {
    in: "blurred",
    in2: "disp_map",
    xChannelSelector: "R",
    yChannelSelector: "G",
    result: "displaced",
  });
  const sat = svgEl("feColorMatrix", {
    in: "displaced",
    type: "saturate",
    values: cfg.specularSat,
    result: "displaced_sat",
  });
  const spec = svgEl("feImage", { x: 0, y: 0, result: "spec_layer" });
  const comp = svgEl("feComposite", {
    in: "displaced_sat",
    in2: "spec_layer",
    operator: "in",
    result: "spec_masked",
  });
  const tr = svgEl("feComponentTransfer", {
    in: "spec_layer",
    result: "spec_faded",
  });
  const funcA = svgEl("feFuncA", { type: "linear" });
  tr.appendChild(funcA);
  const b1 = svgEl("feBlend", {
    in: "spec_masked",
    in2: "displaced",
    mode: "normal",
    result: "with_sat",
  });
  const b2 = svgEl("feBlend", {
    in: "spec_faded",
    in2: "with_sat",
    mode: "normal",
  });
  filter.append(blur, dispImg, dispMap, sat, spec, comp, tr, b1, b2);
  const nodes: GlassFilterNodes = { filter, blur, dispImg, dispMap, spec, funcA };
  updateFilter(nodes, w, h, radius, cfg);
  return nodes;
}

// Hitung ulang geometri refraksi (map + region) untuk ukuran pill saat ini
// dan tulis ke node yang sudah ada. Semua koordinat userSpaceOnUse mengikuti
// w/h terbaru → kaca melebar/menyempit mengikuti kotak elemen.
function updateFilter(
  nodes: GlassFilterNodes,
  w: number,
  h: number,
  radius: number,
  cfg: LiquidGlassConfig
) {
  const bezel = Math.min(cfg.bezelWidth, radius - 1, Math.min(w, h) / 2 - 1);
  const profile = calcRefractionProfile(
    cfg.glassThickness,
    bezel,
    cfg.ior,
    256
  );
  const maxDisp = Math.max(...Array.from(profile).map(Math.abs)) || 1;
  // Kualitas tinggi: peta displacement + specular di-render 2x lalu
  // di-downscale feImage ke ukuran userSpace, sehingga gradasi refraksi
  // rapat dan tidak pecah/berundak. Ukuran pill kecil jadi biayanya ringan.
  const S = 2;
  const mw = Math.max(8, Math.round(w * S));
  const mh = Math.max(8, Math.round(h * S));
  const dispUrl = generateDisplacementMap(mw, mh, radius * S, bezel * S, profile, maxDisp);
  const specUrl = generateSpecularMap(
    mw,
    mh,
    radius * S,
    bezel * S * 2.5,
    !!cfg.balancedSpecular
  );
  const scale = maxDisp * cfg.scaleRatio;
  const pad = cfg.balancedSpecular ? 0.36 : 0;
  const fx = Math.round(-w * pad);
  const fy = Math.round(-h * pad);
  const fw = Math.round(w * (1 + pad * 2));
  const fh = Math.round(h * (1 + pad * 2));

  nodes.filter.setAttribute("x", String(fx));
  nodes.filter.setAttribute("y", String(fy));
  nodes.filter.setAttribute("width", String(fw));
  nodes.filter.setAttribute("height", String(fh));
  nodes.blur.setAttribute("stdDeviation", String(cfg.blur));
  nodes.dispImg.setAttribute("href", dispUrl);
  nodes.dispImg.setAttribute("width", String(w));
  nodes.dispImg.setAttribute("height", String(h));
  nodes.dispMap.setAttribute("scale", String(scale));
  nodes.spec.setAttribute("href", specUrl);
  nodes.spec.setAttribute("width", String(w));
  nodes.spec.setAttribute("height", String(h));
  nodes.funcA.setAttribute("slope", String(cfg.specularOpacity));
}

export interface LiquidGlassHandle {
  rebuild: () => void;
  destroy: () => void;
  /** Paksa hitung ulang geometri walau ukuran tidak berubah (mis.
      untuk menerapkan perubahan config dinamis seperti strength). */
  refresh: () => void;
}

// Tempel lapisan refraksi + tint ke elemen (cara kerja persis demo).
// Mengembalikan handle rebuild/destroy; panggil destroy saat unmount.
export function applyLiquidGlass(
  el: HTMLElement,
  getConfig: () => LiquidGlassConfig
): LiquidGlassHandle {
  if (getComputedStyle(el).position === "static") {
    el.style.position = "relative";
  }

  const refr = document.createElement("div");
  refr.className = "lg-layer";
  refr.setAttribute("aria-hidden", "true");
  refr.style.cssText =
    "position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity .35s ease;";
  const tint = document.createElement("div");
  tint.className = "lg-layer";
  tint.setAttribute("aria-hidden", "true");
  tint.style.cssText =
    "position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity .35s ease;";
  el.insertBefore(tint, el.firstChild);
  el.insertBefore(refr, el.firstChild);

  let filterNodes: GlassFilterNodes | null = null;
  // Ukuran terakhir yang sudah dirender — dipakai untuk skip kerja saat
  // ukuran tidak berubah (rebuild sering dipanggil per frame).
  let lastW = 0;
  let lastH = 0;
  let lastR = 0;
  let timer: number | undefined;
  let fadeRaf = 0;

  function elevate() {
    Array.from(el.children).forEach((c) => {
      const child = c as HTMLElement;
      if (child === refr || child === tint) return;
      if (getComputedStyle(child).position === "static") {
        child.style.position = "relative";
      }
      if (!child.style.zIndex) child.style.zIndex = "1";
    });
  }

  function rebuild() {
    const defs = ensureGlassDefs();
    if (!defs) return;
    const rect = el.getBoundingClientRect();
    const w = Math.round(el.offsetWidth || rect.width);
    const h = Math.round(el.offsetHeight || rect.height);
    if (w < 4 || h < 4) return;
    const dataR = parseFloat(el.getAttribute("data-radius") || "0");
    const cssR = parseFloat(getComputedStyle(el).borderTopLeftRadius || "0");
    const r = Math.max(2, Math.min(dataR || cssR || 24, w / 2, h / 2));
    const cfg = getConfig();

    // Ukuran sama seperti render terakhir → tidak ada yang perlu dihitung.
    if (filterNodes && w === lastW && h === lastH && r === lastR) return;

    if (!filterNodes) {
      // Sekali saja: bikin node filter + tempel backdrop-filter ke lapisan.
      const id = "lg-" + Math.random().toString(36).slice(2, 10);
      filterNodes = buildFilter(id, w, h, r, cfg);
      defs.appendChild(filterNodes.filter);
      refr.style.backdropFilter = `url(#${id})`;
      (refr.style as CSSStyleDeclaration & { webkitBackdropFilter?: string })
        .webkitBackdropFilter = `url(#${id})`;
      tint.style.backgroundColor = `rgba(${cfg.tintColor},${cfg.tintOpacity})`;
      tint.style.boxShadow = `inset 0 0 ${cfg.innerShadowBlur}px ${cfg.innerShadowSpread}px ${cfg.innerShadow}`;
      elevate();
      // Fade-in lapisan kaca (hanya pembuatan pertama): backdrop-filter +
      // peta refraksi aktif belakangan secara asinkron di compositor —
      // tanpa fade akan terlihat "pop" (mis. panel modal 100 lalu tiba-tiba
      // turun ke 85 di detik terakhir animasi buka). Double rAF agar frame
      // opacity 0 sempat ter-paint dulu. Rebuild berikutnya tidak menyentuh
      // opacity lagi.
      window.cancelAnimationFrame(fadeRaf);
      fadeRaf = window.requestAnimationFrame(() => {
        fadeRaf = window.requestAnimationFrame(() => {
          refr.style.opacity = "1";
          tint.style.opacity = "1";
        });
      });
    } else {
      // Reuse node + ID yang sama → update geometri in-place. Backdrop-filter
      // tidak di-render ulang dari nol, jadi lebar pill bisa diikuti tiap frame
      // tanpa flicker (kaca melebar bareng pil abu).
      updateFilter(filterNodes, w, h, r, cfg);
    }
    refr.style.borderRadius = `${r}px`;
    tint.style.borderRadius = `${r}px`;
    lastW = w;
    lastH = h;
    lastR = r;
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(rebuild, 16);
  }

  const ro = new ResizeObserver(schedule);
  ro.observe(el);
  rebuild();

  return {
    rebuild,
    refresh() {
      lastW = 0;
      lastH = 0;
      lastR = 0;
      rebuild();
    },
    destroy() {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(fadeRaf);
      ro.disconnect();
      if (filterNodes) filterNodes.filter.remove();
      filterNodes = null;
      refr.remove();
      tint.remove();
    },
  };
}

export { clamp };
