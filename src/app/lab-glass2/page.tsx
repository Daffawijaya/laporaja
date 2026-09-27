"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef } from "react";
import "./demo.css";

type GlassConfig = {
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
};

const DEFAULT_CONFIG: GlassConfig = {
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

const DEFAULT_SWITCHER_CONFIG: GlassConfig = {
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

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function num(v: unknown, d: number, min: number, max: number) {
  const raw = typeof v === "string" ? v.replace(",", ".") : v;
  const n = Number(raw);
  if (!Number.isFinite(n)) return d;
  return clamp(n, min, max);
}

function sanitize(raw: any, defaults: GlassConfig): GlassConfig {
  const x = raw && typeof raw === "object" ? raw : {};
  return {
    glassThickness: num(x.glassThickness, defaults.glassThickness, 0, 400),
    bezelWidth: num(x.bezelWidth, defaults.bezelWidth, 0, 400),
    ior: num(x.ior, defaults.ior, 1, 8),
    scaleRatio: num(x.scaleRatio, defaults.scaleRatio, 0, 10),
    blur: num(x.blur, defaults.blur, 0, 30),
    specularOpacity: num(
      x.specularOpacity,
      defaults.specularOpacity,
      0,
      3
    ),
    specularSat: num(x.specularSat, defaults.specularSat, 0, 3),
    tintColor:
      typeof x.tintColor === "string" ? x.tintColor : defaults.tintColor,
    tintOpacity: num(x.tintOpacity, defaults.tintOpacity, 0, 1),
    innerShadow:
      typeof x.innerShadow === "string"
        ? x.innerShadow
        : defaults.innerShadow,
    innerShadowBlur: num(
      x.innerShadowBlur,
      defaults.innerShadowBlur,
      0,
      300
    ),
    innerShadowSpread: num(
      x.innerShadowSpread,
      defaults.innerShadowSpread,
      -300,
      300
    ),
    balancedSpecular:
      typeof x.balancedSpecular === "boolean"
        ? x.balancedSpecular
        : !!defaults.balancedSpecular,
  };
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

export default function LabGlassPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const R = rootRef.current as HTMLDivElement | null;
    if (!R) return;
    const root: HTMLDivElement = R;
    document.title = "Liquid Glass Demo";

    const STORAGE_KEY = "lg_demo_config_v2";
    let config = deepClone(DEFAULT_CONFIG);
    let switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
    const targets = new Map<
      Element,
      { rebuild: () => void; destroy: () => void }
    >();
    let defs: SVGSVGElement | SVGGElement | null = null;

    function saveConfig() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ config, switcherConfig })
      );
    }
    function loadConfigBundle() {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (!v) {
          config = deepClone(DEFAULT_CONFIG);
          switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
          return;
        }
        const parsed = JSON.parse(v);
        if (parsed && parsed.config) {
          config = sanitize(parsed.config, DEFAULT_CONFIG);
          switcherConfig = sanitize(
            parsed.switcherConfig || parsed.config,
            DEFAULT_SWITCHER_CONFIG
          );
        } else {
          config = sanitize(parsed, DEFAULT_CONFIG);
          switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
        }
      } catch {
        config = deepClone(DEFAULT_CONFIG);
        switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
      }
    }

    function setStatus(text: string) {
      const n = root.querySelector(
        "#statusText"
      ) as (HTMLElement & { __t?: number }) | null;
      if (!n) return;
      n.textContent = text;
      window.clearTimeout(n.__t);
      n.__t = window.setTimeout(() => {
        n.textContent = "";
      }, 1100);
    }

    function ensureDefs() {
      const old = document.getElementById("demo-lg-defs");
      if (old && document.documentElement.contains(old)) {
        defs = old as unknown as SVGGElement;
        return;
      }
      const svg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
      );
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:-1;";
      const inner = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "defs"
      );
      inner.id = "demo-lg-defs";
      svg.appendChild(inner);
      document.documentElement.appendChild(svg);
      defs = inner as unknown as SVGGElement;
    }

    function buildFilter(
      id: string,
      w: number,
      h: number,
      radius: number,
      cfg: GlassConfig
    ) {
      const bezel = Math.min(
        cfg.bezelWidth,
        radius - 1,
        Math.min(w, h) / 2 - 1
      );
      const profile = calcRefractionProfile(
        cfg.glassThickness,
        bezel,
        cfg.ior,
        128
      );
      const maxDisp = Math.max(...Array.from(profile).map(Math.abs)) || 1;
      const dispUrl = generateDisplacementMap(
        w,
        h,
        radius,
        bezel,
        profile,
        maxDisp
      );
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
      tr.appendChild(svgEl("feFuncA", { type: "linear", slope: cfg.specularOpacity }));
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

    function applyGlass(el: HTMLElement, cfgGetter: () => GlassConfig) {
      if (targets.has(el)) return;
      if (getComputedStyle(el).position === "static")
        el.style.position = "relative";

      const refr = document.createElement("div");
      refr.className = "lg-layer";
      refr.style.cssText =
        "position:absolute;inset:0;z-index:0;pointer-events:none;";
      const tint = document.createElement("div");
      tint.className = "lg-layer";
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
          if (getComputedStyle(child).position === "static")
            child.style.position = "relative";
          if (!child.style.zIndex) child.style.zIndex = "1";
        });
      }
      function rebuild() {
        ensureDefs();
        const rect = el.getBoundingClientRect();
        const w = Math.round(el.offsetWidth || rect.width);
        const h = Math.round(el.offsetHeight || rect.height);
        if (w < 4 || h < 4) return;
        const dataR = parseFloat(el.getAttribute("data-radius") || "0");
        const cssR = parseFloat(
          getComputedStyle(el).borderTopLeftRadius || "0"
        );
        const r = Math.max(2, Math.min(dataR || cssR || 24, w / 2, h / 2));
        if (filterNode) filterNode.remove();
        const cfg = cfgGetter();
        const id =
          "demo-lg-" + Math.random().toString(36).slice(2, 10);
        filterNode = buildFilter(id, w, h, r, cfg);
        defs?.appendChild(filterNode);
        refr.style.borderRadius = r + "px";
        (refr.style as any).backdropFilter = `url(#${id})`;
        (refr.style as any).webkitBackdropFilter = `url(#${id})`;
        tint.style.borderRadius = r + "px";
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
      targets.set(el, {
        rebuild,
        destroy() {
          window.clearTimeout(timer);
          ro.disconnect();
          if (filterNode) filterNode.remove();
          refr.remove();
          tint.remove();
        },
      });
      rebuild();
    }

    function removeGlass(el: Element) {
      const inst = targets.get(el);
      if (!inst) return;
      inst.destroy();
      targets.delete(el);
    }

    function enableGlass(el: HTMLElement, cfgGetter: () => GlassConfig) {
      if (!targets.has(el)) applyGlass(el, cfgGetter);
      else targets.get(el)!.rebuild();
    }

    function rebuildAll() {
      targets.forEach((inst) => inst.rebuild());
    }

    function bindConfigPanel() {
      const fields = [
        "glassThickness",
        "bezelWidth",
        "ior",
        "scaleRatio",
        "blur",
        "specularOpacity",
        "specularSat",
        "tintColor",
        "tintOpacity",
        "innerShadow",
        "innerShadowBlur",
        "innerShadowSpread",
      ];
      const swFields = fields.slice();

      fields.forEach((k) => {
        const input = root.querySelector(
          "#cfg-" + k
        ) as HTMLInputElement | null;
        if (!input) return;
        input.value = String((config as any)[k]);
        input.addEventListener("input", () => {
          (config as any)[k] =
            input.type === "number" ? Number(input.value) : input.value;
          config = sanitize(config, DEFAULT_CONFIG);
          rebuildAll();
        });
      });
      swFields.forEach((k) => {
        const input = root.querySelector(
          "#sw-" + k
        ) as HTMLInputElement | null;
        if (!input) return;
        input.value = String((switcherConfig as any)[k]);
        input.addEventListener("input", () => {
          (switcherConfig as any)[k] =
            input.type === "number" ? Number(input.value) : input.value;
          switcherConfig = sanitize(
            switcherConfig,
            DEFAULT_SWITCHER_CONFIG
          );
          rebuildAll();
        });
      });

      root.querySelector("#saveBtn")?.addEventListener("click", () => {
        saveConfig();
        setStatus("saved");
      });
      root.querySelector("#resetBtn")?.addEventListener("click", () => {
        config = deepClone(DEFAULT_CONFIG);
        switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
        fields.forEach((k) => {
          const input = root.querySelector(
            "#cfg-" + k
          ) as HTMLInputElement | null;
          if (input) input.value = String((config as any)[k]);
        });
        swFields.forEach((k) => {
          const input = root.querySelector(
            "#sw-" + k
          ) as HTMLInputElement | null;
          if (input) input.value = String((switcherConfig as any)[k]);
        });
        rebuildAll();
        setStatus("reset");
      });
      root.querySelector("#rebuildBtn")?.addEventListener("click", () => {
        rebuildAll();
        setStatus("rebuilt");
      });
    }

    function bindNavSwitcher() {
      const nav = root.querySelector(".ios26-nav-inner") as HTMLElement | null;
      const navWrap = root.querySelector(".ios26-nav") as HTMLElement | null;
      if (!nav) return;
      const glow = root.querySelector("#navGlow") as HTMLElement | null;
      const indicator = root.querySelector(
        "#tabIndicator"
      ) as HTMLElement | null;
      const items = Array.from(
        nav.querySelectorAll(".ios-item")
      ) as HTMLElement[];
      if (!nav || !navWrap || !glow || !indicator || !items.length) return;

      const DRAG_THRESHOLD = 6;
      const OVERSHOOT = 22;

      let active = Math.max(
        0,
        items.findIndex((x) => x.classList.contains("active"))
      );
      let targetIndex = active;
      let pointerId: number | null = null;
      let pressX = 0;
      let pressY = 0;
      let dragMode = false;
      let pressWidth = 0;
      let finishTimer: number | undefined;
      let glassRebuildQueued = false;

      function navRect() {
        return nav!.getBoundingClientRect();
      }

      function toLocalX(clientX: number) {
        const nr = navRect();
        const sx = nr.width > 0 ? nav!.clientWidth / nr.width : 1;
        return (clientX - nr.left) * sx;
      }

      function itemMetrics(i: number) {
        const nr = navRect();
        const ir = items[i].getBoundingClientRect();
        const sx = nr.width > 0 ? nav!.clientWidth / nr.width : 1;
        const left = (ir.left - nr.left) * sx;
        const width = ir.width * sx;
        return { left, width, center: left + width / 2 };
      }

      function nearestIndex(localX: number) {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < items.length; i++) {
          const d = Math.abs(localX - itemMetrics(i).center);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return best;
      }

      function setActive(i: number) {
        active = i;
        items.forEach((btn, idx) =>
          btn.classList.toggle("active", idx === i)
        );
      }

      function setIndicator(left: number, width: number, animate: boolean) {
        if (!animate) {
          const old = indicator!.style.transition;
          indicator!.style.transition = "none";
          indicator!.style.left = `${left}px`;
          indicator!.style.width = `${width}px`;
          indicator!.offsetWidth;
          indicator!.style.transition = old;
          return;
        }
        indicator!.style.left = `${left}px`;
        indicator!.style.width = `${width}px`;
      }

      function snapToIndex(i: number, animate: boolean) {
        const m = itemMetrics(i);
        setIndicator(m.left, m.width, animate);
      }

      function setGlow(clientX: number, clientY: number, alpha: number) {
        const nr = navRect();
        const lx = toLocalX(clientX);
        nav!.style.setProperty("--gx", `${lx}px`);
        nav!.style.setProperty("--gy", `${clientY - nr.top}px`);
        nav!.style.setProperty("--ga", String(alpha));
      }

      function forceGlassRebuild() {
        const inst = targets.get(indicator!);
        if (inst) inst.rebuild();
      }

      function queueGlassRebuild() {
        if (glassRebuildQueued) return;
        glassRebuildQueued = true;
        requestAnimationFrame(() => {
          glassRebuildQueued = false;
          forceGlassRebuild();
        });
      }

      function beginInteraction(clientX: number, clientY: number) {
        window.clearTimeout(finishTimer);
        indicator!.classList.add("interacting");
        navWrap!.classList.add("engaged");
        setGlow(clientX, clientY, 0.24);
        enableGlass(indicator!, () => ({
          ...switcherConfig,
          balancedSpecular: true,
        }));
        queueGlassRebuild();
      }

      function endInteraction() {
        window.clearTimeout(finishTimer);
        finishTimer = window.setTimeout(() => {
          indicator!.classList.remove("interacting");
          nav!.classList.remove("dragging");
          navWrap!.classList.remove("engaged");
          nav!.style.setProperty("--ga", "0");
          removeGlass(indicator!);
        }, 500);
      }

      function dragMove(clientX: number) {
        const localX = toLocalX(clientX);
        const w = pressWidth || itemMetrics(active).width;
        let left = localX - w / 2;
        left = clamp(left, -OVERSHOOT, nav!.clientWidth - w + OVERSHOOT);
        indicator!.style.left = `${left}px`;
        indicator!.style.width = `${w}px`;
        targetIndex = nearestIndex(localX);
        queueGlassRebuild();
      }

      function clearPointerHandlers() {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
      }

      function finishSelection() {
        nav!.classList.remove("dragging");
        setActive(targetIndex);
        snapToIndex(targetIndex, true);
        queueGlassRebuild();
        window.setTimeout(queueGlassRebuild, 120);
        endInteraction();
      }

      function onPointerMove(e: PointerEvent) {
        if (e.pointerId !== pointerId) return;
        const dx = Math.abs(e.clientX - pressX);
        const dy = Math.abs(e.clientY - pressY);
        if (!dragMode && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
          dragMode = true;
          nav!.classList.add("dragging");
        }

        if (dragMode) {
          setGlow(e.clientX, e.clientY, 0.18);
          dragMove(e.clientX);
        } else {
          setGlow(e.clientX, e.clientY, 0.22);
        }
      }

      function onPointerUp(e: PointerEvent) {
        if (e.pointerId !== pointerId) return;
        clearPointerHandlers();
        finishSelection();
        pointerId = null;
        dragMode = false;
      }

      function onPointerCancel(e: PointerEvent) {
        if (e.pointerId !== pointerId) return;
        clearPointerHandlers();
        nav!.classList.remove("dragging");
        snapToIndex(active, true);
        endInteraction();
        pointerId = null;
        dragMode = false;
      }

      function armPointer(idx: number, e: PointerEvent) {
        if (pointerId !== null) return;
        pointerId = e.pointerId;
        dragMode = false;
        targetIndex = idx;
        pressX = e.clientX;
        pressY = e.clientY;
        pressWidth = itemMetrics(idx).width;

        beginInteraction(e.clientX, e.clientY);

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerCancel);
      }

      const cleanups: Array<() => void> = [];
      items.forEach((btn, idx) => {
        btn.style.touchAction = "none";
        const h = (e: PointerEvent) => {
          if (!e.isPrimary || e.button !== 0) return;
          e.preventDefault();
          armPointer(idx, e);
        };
        btn.addEventListener("pointerdown", h);
        cleanups.push(() => btn.removeEventListener("pointerdown", h));
      });

      snapToIndex(active, false);
      const onResize = () => snapToIndex(active, false);
      window.addEventListener("resize", onResize);
      cleanups.push(() => window.removeEventListener("resize", onResize));
      return () => cleanups.forEach((fn) => fn());
    }

    function makeDraggable(el: HTMLElement | null) {
      if (!el) return () => {};
      let dragging = false;
      let ox = 0;
      let oy = 0;

      function onMove(e: MouseEvent) {
        if (!dragging) return;
        const x = e.clientX - ox;
        const y = e.clientY - oy;
        const maxX = window.innerWidth - el!.offsetWidth;
        const maxY = window.innerHeight - el!.offsetHeight;
        el!.style.left = clamp(x, 0, Math.max(0, maxX)) + "px";
        el!.style.top = clamp(y, 0, Math.max(0, maxY)) + "px";
        el!.style.right = "auto";
        el!.style.bottom = "auto";
      }

      function onUp() {
        if (!dragging) return;
        dragging = false;
        el!.classList.remove("dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }

      const onDown = (e: MouseEvent) => {
        if (e.button !== 0) return;
        dragging = true;
        const r = el.getBoundingClientRect();
        ox = e.clientX - r.left;
        oy = e.clientY - r.top;
        el.classList.add("dragging");
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      };
      el.addEventListener("mousedown", onDown);
      return () => el.removeEventListener("mousedown", onDown);
    }

    function bindThemeCard() {
      const THEME_KEY = "lg_demo_theme_v1";
      const WIFI_KEY = "lg_demo_wifi_v1";
      const lightBtn = root.querySelector(
        "#light-btn"
      ) as HTMLButtonElement | null;
      const darkBtn = root.querySelector(
        "#dark-btn"
      ) as HTMLButtonElement | null;
      const wifiSwitch = root.querySelector(
        "#wifi-switch"
      ) as HTMLButtonElement | null;
      const wifiRow = root.querySelector("#wifi-row") as HTMLElement | null;
      if (!lightBtn || !darkBtn) return () => {};

      function applyTheme(theme: string) {
        const dark = theme === "dark";
        root.classList.toggle("dark-theme", dark);
        root.classList.toggle("light-theme", !dark);
        lightBtn!.classList.toggle("active", !dark);
        darkBtn!.classList.toggle("active", dark);
        window.setTimeout(rebuildAll, 40);
      }

      function setTheme(theme: string) {
        const normalized = theme === "dark" ? "dark" : "light";
        applyTheme(normalized);
        localStorage.setItem(THEME_KEY, normalized);
      }

      setTheme(localStorage.getItem(THEME_KEY) || "light");

      const h1 = () => setTheme("light");
      const h2 = () => setTheme("dark");
      lightBtn.addEventListener("click", h1);
      darkBtn.addEventListener("click", h2);

      let cleanupWifi = () => {};
      if (wifiSwitch && wifiRow) {
        let wifiOn = localStorage.getItem(WIFI_KEY) !== "off";
        function applyWifiState() {
          wifiSwitch!.classList.toggle("active", wifiOn);
          wifiRow!.classList.toggle("wifi-on", wifiOn);
        }
        applyWifiState();
        const hw = () => {
          wifiOn = !wifiOn;
          applyWifiState();
          localStorage.setItem(WIFI_KEY, wifiOn ? "on" : "off");
        };
        wifiSwitch.addEventListener("click", hw);
        cleanupWifi = () => wifiSwitch.removeEventListener("click", hw);
      }
      return () => {
        lightBtn.removeEventListener("click", h1);
        darkBtn.removeEventListener("click", h2);
        cleanupWifi();
      };
    }

    loadConfigBundle();
    ensureDefs();
    root
      .querySelectorAll(".lg-demo-target")
      .forEach((el) => applyGlass(el as HTMLElement, () => config));
    const cleanupNav = bindNavSwitcher();
    bindConfigPanel();
    const cleanupTheme = bindThemeCard();
    const cleanupDrag1 = makeDraggable(
      root.querySelector("#glassCircle") as HTMLElement | null
    );
    const cleanupDrag2 = makeDraggable(
      root.querySelector("#glassSquare") as HTMLElement | null
    );
    const onResizeAll = () => rebuildAll();
    window.addEventListener("resize", onResizeAll);
    setStatus("ready");

    return () => {
      window.removeEventListener("resize", onResizeAll);
      cleanupNav?.();
      cleanupTheme?.();
      cleanupDrag1?.();
      cleanupDrag2?.();
      targets.forEach((inst) => inst.destroy());
      targets.clear();
      document.getElementById("demo-lg-defs")?.parentElement?.remove();
    };
  }, []);

  return (
    <div ref={rootRef} className="lab-lg light-theme">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />
      <div className="bg-orb orb-c" />

      <header className="ios26-nav lg-demo-target" data-radius="999">
        <div className="ios26-nav-inner">
          <div className="nav-glow" id="navGlow" />
          <div className="tab-indicator" id="tabIndicator" />
          <button className="ios-item active" type="button">
            <svg className="ios-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.5 4 9v10.2c0 .7.6 1.3 1.3 1.3h5.4v-6.4h2.6v6.4h5.4c.7 0 1.3-.6 1.3-1.3V9l-8-5.5Z" />
            </svg>
            <span>Home</span>
          </button>
          <button className="ios-item" type="button">
            <svg className="ios-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 5h14v14H5V5Zm2.3 2.3v9.4h9.4V7.3H7.3Zm1.4 1.4h6.6v1.8H8.7V8.7Zm0 3.2h6.6v1.8H8.7v-1.8Z" />
            </svg>
            <span>Apps</span>
          </button>
          <button className="ios-item" type="button">
            <svg className="ios-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.8 3 7.2v9.6l9 4.4 9-4.4V7.2l-9-4.4Zm0 2.3 6.6 3.2-6.6 3.2-6.6-3.2L12 5.1Zm-6.8 5.1 5.5 2.7v5.8l-5.5-2.7v-5.8Zm8.1 8.5v-5.8l5.5-2.7v5.8l-5.5 2.7Z" />
            </svg>
            <span>Design</span>
          </button>
          <button className="ios-item" type="button">
            <svg className="ios-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6Zm0 2.4a6.4 6.4 0 1 1 0 12.8 6.4 6.4 0 0 1 0-12.8Zm-.1 2.8c-1.8 0-3.1 1.1-3.3 2.8h2.4c.1-.5.5-.8 1-.8.7 0 1.1.4 1.1 1 0 .4-.2.8-.7 1.1-.9.6-1.7 1.2-1.7 2.6v.2h2.3c0-.7.2-1 .9-1.5.8-.5 1.6-1.3 1.6-2.6 0-1.8-1.5-2.8-3.6-2.8Zm-.1 8.8a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" />
            </svg>
            <span>Support</span>
          </button>
        </div>
      </header>

      <main className="page-wrap">
        <section className="hero neumorph-panel">
          <p className="eyebrow">Liquid Glass Playground</p>
          <h1>Minimal Interface Study For Refraction Surfaces</h1>
          <p className="lead">
            This showcase demonstrates a restrained visual language designed to
            amplify your custom liquid glass layer. Drag the circle and rounded
            square around the page to inspect distortion behavior on photos,
            text blocks and soft neutral panels.
          </p>
        </section>

        <section className="content-grid">
          <article className="neumorph-panel card-text">
            <h2>Atmosphere</h2>
            <p>
              The layout uses low-contrast backgrounds, generous spacing and
              subtle elevation. It keeps visual noise low so refractive overlays
              remain readable and premium.
            </p>
          </article>

          <article className="neumorph-panel card-photo">
            <img
              src="https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1400&auto=format&fit=crop"
              alt="Abstract technology environment"
            />
          </article>

          <article className="neumorph-panel card-photo">
            <img
              src="https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=1400&auto=format&fit=crop"
              alt="Laptop and development workspace"
            />
          </article>

          <article className="neumorph-panel card-text">
            <h2>Readable Layers</h2>
            <p>
              Typography and color stops were tuned to stay legible under blur
              and refraction. The same structure adapts to both light and dark
              mood without redesigning components.
            </p>
          </article>
        </section>

        <section className="feature-layout">
          <article className="neumorph-panel prose-panel">
            <h2>Design Notes</h2>
            <p>
              Use this page as a controlled environment: the cards, photo blocks
              and long text strips are intentionally mixed to expose edge cases
              in displacement and specular rendering.
            </p>
            <p>
              Fine grain controls stay available in the right panel. Adjust blur
              and thickness in real time and compare behavior on soft gradients
              versus high-frequency image textures.
            </p>
            <p>
              The top switcher remains interactive and is purposefully compact.
              This lets you test micro-surfaces while the larger draggable
              shapes validate behavior on broader radii.
            </p>
          </article>

          <article className="neumorph-panel theme-card-wrap">
            <div className="neumorphic-card lg-demo-target" data-radius="48">
              <div className="card-content">
                <h3 className="panel-title">Settings Panel</h3>

                <div className="toggle-container">
                  <button
                    className="toggle-button active"
                    id="light-btn"
                    type="button"
                    aria-label="Enable light theme"
                  >
                    <svg
                      className="toggle-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" />
                      <line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                  </button>
                  <button
                    className="toggle-button"
                    id="dark-btn"
                    type="button"
                    aria-label="Enable dark theme"
                  >
                    <svg
                      className="toggle-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  </button>
                </div>

                <div className="wifi-row" id="wifi-row">
                  <svg
                    className="wifi-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                    <line x1="12" y1="20" x2="12.01" y2="20" />
                  </svg>
                  <span className="wifi-label">Wi-Fi Network</span>
                  <button
                    className="switch-track active"
                    id="wifi-switch"
                    type="button"
                    aria-label="Toggle Wi-Fi"
                  >
                    <span className="switch-thumb" />
                  </button>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="reading-grid">
          <article className="neumorph-panel long-copy">
            <h2>Long-Form Surface Test</h2>
            <p>
              Minimal surfaces are most useful when they stay calm under motion.
              Scroll, drag and toggle theme while observing how your glass
              effect preserves edge contrast and text readability.
            </p>
            <p>
              Curabitur blandit tempus porttitor. Integer posuere erat a ante
              venenatis dapibus posuere velit aliquet. Maecenas faucibus mollis
              interdum. Donec ullamcorper nulla non metus auctor fringilla.
            </p>
            <p>
              Sed posuere consectetur est at lobortis. Cras mattis consectetur
              purus sit amet fermentum. Praesent commodo cursus magna, vel
              scelerisque nisl consectetur et.
            </p>
          </article>
          <article className="neumorph-panel card-photo tall-photo">
            <img
              src="https://images.unsplash.com/photo-1484417894907-623942c8ee29?q=80&w=1400&auto=format&fit=crop"
              alt="Minimal architecture interior"
            />
          </article>
        </section>
        <div aria-hidden style={{ height: 1200 }} />
      </main>

      <div
        className="glass-circle lg-demo-target draggable"
        id="glassCircle"
        data-radius="999"
      />
      <div
        className="glass-square lg-demo-target draggable"
        id="glassSquare"
        data-radius="28"
      />

      <aside className="demo-panel">
        <div className="demo-head">
          <strong>Liquid Glass</strong>
          <span id="statusText" />
        </div>
        <div className="demo-body">
          <label>
            glassThickness <input id="cfg-glassThickness" type="number" step={1} />
          </label>
          <label>
            bezelWidth <input id="cfg-bezelWidth" type="number" step={1} />
          </label>
          <label>
            ior <input id="cfg-ior" type="number" step={0.01} />
          </label>
          <label>
            scaleRatio <input id="cfg-scaleRatio" type="number" step={0.01} />
          </label>
          <label>
            blur <input id="cfg-blur" type="number" step={0.1} />
          </label>
          <label>
            specularOpacity{" "}
            <input id="cfg-specularOpacity" type="number" step={0.01} />
          </label>
          <label>
            specularSat <input id="cfg-specularSat" type="number" step={0.01} />
          </label>
          <label>
            tintColor (r,g,b) <input id="cfg-tintColor" type="text" />
          </label>
          <label>
            tintOpacity <input id="cfg-tintOpacity" type="number" step={0.01} />
          </label>
          <label>
            innerShadow <input id="cfg-innerShadow" type="text" />
          </label>
          <label>
            innerShadowBlur{" "}
            <input id="cfg-innerShadowBlur" type="number" step={1} />
          </label>
          <label>
            innerShadowSpread{" "}
            <input id="cfg-innerShadowSpread" type="number" step={1} />
          </label>
          <hr />
          <label>
            <strong>Switcher Glass</strong>
          </label>
          <label>
            glassThickness <input id="sw-glassThickness" type="number" step={1} />
          </label>
          <label>
            bezelWidth <input id="sw-bezelWidth" type="number" step={1} />
          </label>
          <label>
            ior <input id="sw-ior" type="number" step={0.01} />
          </label>
          <label>
            scaleRatio <input id="sw-scaleRatio" type="number" step={0.01} />
          </label>
          <label>
            blur <input id="sw-blur" type="number" step={0.1} />
          </label>
          <label>
            specularOpacity{" "}
            <input id="sw-specularOpacity" type="number" step={0.01} />
          </label>
          <label>
            specularSat <input id="sw-specularSat" type="number" step={0.01} />
          </label>
          <label>
            tintColor (r,g,b) <input id="sw-tintColor" type="text" />
          </label>
          <label>
            tintOpacity <input id="sw-tintOpacity" type="number" step={0.01} />
          </label>
          <label>
            innerShadow <input id="sw-innerShadow" type="text" />
          </label>
          <label>
            innerShadowBlur{" "}
            <input id="sw-innerShadowBlur" type="number" step={1} />
          </label>
          <label>
            innerShadowSpread{" "}
            <input id="sw-innerShadowSpread" type="number" step={1} />
          </label>
          <div className="btns">
            <button id="saveBtn" type="button">
              Save
            </button>
            <button id="resetBtn" type="button">
              Reset
            </button>
            <button id="rebuildBtn" type="button">
              Rebuild
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
