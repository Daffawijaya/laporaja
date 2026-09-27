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
      d[idx] = (128 + dX * 127 * op + 0.5) | 0;
      d[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
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
      const alpha = (col * coeff * op) | 0;
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

function buildFilter(
  id: string,
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
    128
  );
  const maxDisp = Math.max(...Array.from(profile).map(Math.abs)) || 1;
  const dispUrl = generateDisplacementMap(w, h, radius, bezel, profile, maxDisp);
  const specUrl = generateSpecularMap(
    w,
    h,
    radius,
    bezel * 2.5,
    !!cfg.balancedSpecular
  );
  const scale = maxDisp * cfg.scaleRatio;
  const pad = cfg.balancedSpecular ? 0.36 : 0;
  const fx = Math.round(-w * pad);
  const fy = Math.round(-h * pad);
  const fw = Math.round(w * (1 + pad * 2));
  const fh = Math.round(h * (1 + pad * 2));

  const filter = svgEl("filter", {
    id,
    x: String(fx),
    y: String(fy),
    width: String(fw),
    height: String(fh),
    filterUnits: "userSpaceOnUse",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  });
  const blur = svgEl("feGaussianBlur", {
    in: "SourceGraphic",
    stdDeviation: cfg.blur,
    result: "blurred",
  });
  const dispImg = svgEl("feImage", {
    href: dispUrl,
    x: 0,
    y: 0,
    width: w,
    height: h,
    result: "disp_map",
  });
  const dispMap = svgEl("feDisplacementMap", {
    in: "blurred",
    in2: "disp_map",
    scale,
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
  const spec = svgEl("feImage", {
    href: specUrl,
    x: 0,
    y: 0,
    width: w,
    height: h,
    result: "spec_layer",
  });
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
  tr.appendChild(
    svgEl("feFuncA", { type: "linear", slope: cfg.specularOpacity })
  );
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
  return filter;
}

export interface LiquidGlassHandle {
  rebuild: () => void;
  destroy: () => void;
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
    "position:absolute;inset:0;z-index:0;pointer-events:none;";
  const tint = document.createElement("div");
  tint.className = "lg-layer";
  tint.setAttribute("aria-hidden", "true");
  tint.style.cssText =
    "position:absolute;inset:0;z-index:0;pointer-events:none;";
  el.insertBefore(tint, el.firstChild);
  el.insertBefore(refr, el.firstChild);

  let filterNode: Element | null = null;
  let timer: number | undefined;

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
    if (filterNode) filterNode.remove();
    const cfg = getConfig();
    const id = "lg-" + Math.random().toString(36).slice(2, 10);
    filterNode = buildFilter(id, w, h, r, cfg);
    defs.appendChild(filterNode);
    refr.style.borderRadius = `${r}px`;
    refr.style.backdropFilter = `url(#${id})`;
    (refr.style as CSSStyleDeclaration & { webkitBackdropFilter?: string })
      .webkitBackdropFilter = `url(#${id})`;
    tint.style.borderRadius = `${r}px`;
    tint.style.backgroundColor = `rgba(${cfg.tintColor},${cfg.tintOpacity})`;
    tint.style.boxShadow = `inset 0 0 ${cfg.innerShadowBlur}px ${cfg.innerShadowSpread}px ${cfg.innerShadow}`;
    elevate();
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
    destroy() {
      window.clearTimeout(timer);
      ro.disconnect();
      if (filterNode) filterNode.remove();
      refr.remove();
      tint.remove();
    },
  };
}

export { clamp };
